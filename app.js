
/* FOSTRA – Můj trenér AI
   Pořizování obrázků pouze kamerou, maximálně tři kategorie.
   MobileNet extrahuje obrazové příznaky a malý klasifikátor
   TensorFlow.js se trénuje lokálně v prohlížeči. */

const $ = id => document.getElementById(id);

const colors = ["#4285f4", "#34a853", "#fbbc04"];

let classes = [];
let nextId = 1;
let featureModel = null;
let classifier = null;
let embeddingSize = 0;
let captureStream = null;
let previewStream = null;
let activeClassId = null;
let captureFacing = "environment";
let previewFacing = "environment";
let trainingBusy = false;
let classifyBusy = false;
let previewTimer = null;
let toastTimer = null;


/* =========================================
   POMOCNÉ FUNKCE
   ========================================= */

// Správné skloňování počtu obrázků
function formatImageCount(count) {
  if (count === 1) return "1 obrázek";
  if (count >= 2 && count <= 4) return `${count} obrázky`;
  return `${count} obrázků`;
}

// Zobrazení krátkého oznámení
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(
    () => el.classList.remove("show"),
    2600
  );
}

// Zastavení streamu kamery
function stopStream(stream) {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
}

// Vyhledání kategorie podle ID
function getClass(id) {
  return classes.find(item => item.id === id);
}


/* =========================================
   KAMERA
   ========================================= */

async function requestCamera(facing, width = 1280, height = 720) {
  const base = { audio: false };

  // Nejprve se pokusíme otevřít požadovanou kameru.
  try {
    return await navigator.mediaDevices.getUserMedia({
      ...base,
      video: {
        facingMode: { exact: facing },
        width: { ideal: width },
        height: { ideal: height }
      }
    });

  } catch (firstError) {

    // Pokud požadovaná kamera není dostupná,
    // necháme výběr na prohlížeči.
    return await navigator.mediaDevices.getUserMedia({
      ...base,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: width },
        height: { ideal: height }
      }
    });
  }
}


/* =========================================
   SPRÁVA KATEGORIÍ
   ========================================= */

function updateTrainButton() {
  $("train-button").disabled = trainingBusy ||
    classes.length < 2 ||
    !classes.every(item => item.samples.length >= 2);
}

function invalidateModel() {
  if (classifier) classifier.dispose();

  classifier = null;

  $("status-dot").classList.remove("ready");

  $("model-status").textContent =
    "Data se změnila – model je potřeba znovu natrénovat.";

  $("start-test-camera").disabled = true;

  $("predictions").innerHTML =
    '<p class="prediction-empty">Pravděpodobnosti rozpoznání se zobrazí po natrénování modelu.</p>';

  updateTrainButton();
}

function addClass(name) {
  if (classes.length >= 3) {
    return toast("Lze vytvořit maximálně tři kategorie.");
  }

  if (!name) {
    let number = 1;

    while (classes.some(item => item.name === `Objekt č. ${number}`)) {
      number++;
    }

    name = `Objekt č. ${number}`;
  }

  classes.push({
    id: nextId++,
    name,
    color: colors[classes.length],
    samples: []
  });

  renderClasses();
  invalidateModel();
}

function removeClass(id) {
  if (classes.length <= 2) {
    return toast("Aplikace potřebuje alespoň dvě kategorie.");
  }

  classes = classes.filter(item => item.id !== id);

  classes.forEach((item, index) => {
    item.color = colors[index];
  });

  renderClasses();
  invalidateModel();
}


/* =========================================
   VYKRESLENÍ KATEGORIÍ
   ========================================= */

function renderClasses() {
  const host = $("classes");
  host.innerHTML = "";

  classes.forEach(item => {
    const card = document.createElement("article");
    card.className = "class-card";

    card.innerHTML = `
      <div class="class-card-head">
        <span class="class-color"></span>
        <input
          class="class-name"
          maxlength="28"
          aria-label="Název kategorie"
        >
        <button
          class="remove-class"
          type="button"
          aria-label="Odstranit kategorii"
        >⋮</button>
      </div>

      <div class="class-card-body">
        <div class="class-instruction">Přidej obrázky:</div>

        <div class="class-actions">
          <button class="webcam-button" type="button">
            <span class="camera-icon">▣</span>
            <span>Kamera</span>
          </button>
        </div>

        <div class="class-samples"></div>
        <div class="sample-count"></div>
      </div>
    `;

    card.querySelector(".class-color").style.background = item.color;

    const nameInput = card.querySelector(".class-name");

    nameInput.value = item.name;

    nameInput.addEventListener("change", () => {
      item.name = nameInput.value.trim() || `Objekt č. ${classes.indexOf(item) + 1}`;

      nameInput.value = item.name;

      $("camera-class-name").textContent =
        item.id === activeClassId ? item.name : $("camera-class-name").textContent;

      invalidateModel();
    });

    card.querySelector(".remove-class").addEventListener(
      "click",
      () => removeClass(item.id)
    );

    card.querySelector(".webcam-button").addEventListener(
      "click",
      () => openCapture(item.id)
    );

    const samples = card.querySelector(".class-samples");

    item.samples.slice(-8).forEach(sample => {
      const img = document.createElement("img");

      img.src = sample.preview;
      img.alt = "Pořízený trénovací příklad";

      samples.appendChild(img);
    });

    card.querySelector(".sample-count").textContent =
      formatImageCount(item.samples.length);

    host.appendChild(card);
  });

  $("add-class").disabled = classes.length >= 3;

  $("add-class").style.opacity =
    classes.length >= 3 ? ".45" : "1";

  $("add-class").style.cursor =
    classes.length >= 3 ? "default" : "pointer";

  updateTrainButton();
}


/* =========================================
   ZPRACOVÁNÍ OBRÁZKŮ
   ========================================= */

function makeSquareCanvas(source) {
  const width =
    source.videoWidth || source.naturalWidth || source.width;

  const height =
    source.videoHeight || source.naturalHeight || source.height;

  const side = Math.min(width, height);

  const canvas = document.createElement("canvas");

  canvas.width = 224;
  canvas.height = 224;

  canvas.getContext("2d").drawImage(
    source,
    (width - side) / 2,
    (height - side) / 2,
    side,
    side,
    0,
    0,
    224,
    224
  );

  return canvas;
}


/* =========================================
   OBRAZOVÝ MODEL MOBILENET
   ========================================= */

async function ensureFeatureModel() {
  if (featureModel) return;

  $("model-status").textContent =
    "Načítám obrazový model MobileNet…";

  await tf.ready();

  featureModel = await mobilenet.load({
    version: 2,
    alpha: 0.5
  });
}

async function embeddingFrom(source) {
  const canvas = makeSquareCanvas(source);

  const tensor = featureModel.infer(canvas, true).flatten();

  try {
    const values = Array.from(await tensor.data());

    embeddingSize = values.length;

    return { values, canvas };

  } finally {
    tensor.dispose();
  }
}


/* =========================================
   POŘIZOVÁNÍ OBRÁZKŮ
   ========================================= */

async function openCapture(id) {
  activeClassId = id;

  const item = getClass(id);

  $("camera-class-name").textContent = item.name;

  $("capture-count").textContent =
    formatImageCount(item.samples.length);

  $("camera-modal").hidden = false;

  $("camera-placeholder").hidden = false;

  $("camera-placeholder").textContent =
    "Načítám model…";

  $("capture-button").disabled = true;

  try {
    await ensureFeatureModel();

    $("camera-placeholder").textContent =
      "Připojuji kameru…";

    await startCaptureCamera(captureFacing);

  } catch (error) {

    $("camera-placeholder").textContent =
      "Kamera není dostupná. Zkontroluj oprávnění prohlížeče.";

    toast("Nepodařilo se spustit model nebo kameru.");

    console.error(error);
  }
}

async function startCaptureCamera(facing) {
  stopStream(captureStream);

  captureStream = await requestCamera(facing, 1280, 720);

  const video = $("capture-video");

  video.srcObject = captureStream;

  await video.play();

  $("camera-placeholder").hidden = true;

  $("capture-button").disabled = false;
}

async function switchCaptureCamera() {
  captureFacing =
    captureFacing === "environment" ? "user" : "environment";

  try {
    await startCaptureCamera(captureFacing);

  } catch (error) {
    toast("Druhá kamera není dostupná.");
  }
}

function closeCapture() {
  stopStream(captureStream);

  captureStream = null;

  $("capture-video").srcObject = null;

  $("camera-modal").hidden = true;

  $("camera-placeholder").hidden = false;
}

async function captureExample() {
  const video = $("capture-video");

  if (!video.videoWidth || !activeClassId) return;

  try {
    const { values, canvas } = await embeddingFrom(video);

    const item = getClass(activeClassId);

    item.samples.push({
      features: values,
      preview: canvas.toDataURL("image/jpeg", .72)
    });

    renderClasses();

    invalidateModel();

    $("capture-count").textContent =
      formatImageCount(item.samples.length);

  } catch (error) {

    toast("Snímek se nepodařilo zpracovat.");

    console.error(error);
  }
}


/* =========================================
   TRÉNOVÁNÍ KLASIFIKÁTORU
   ========================================= */

async function trainModel() {
  if (trainingBusy) return;

  trainingBusy = true;

  updateTrainButton();

  $("training-progress").hidden = false;

  $("progress-bar").style.width = "0%";

  try {
    await ensureFeatureModel();

    const features = [];
    const labels = [];

    classes.forEach((item, classIndex) => {
      item.samples.forEach(sample => {
        features.push(sample.features);
        labels.push(classIndex);
      });
    });

    const xs = tf.tensor2d(
      features,
      [features.length, embeddingSize]
    );

    const labelTensor = tf.tensor1d(labels, "int32");

    const ys = tf.oneHot(labelTensor, classes.length);

    labelTensor.dispose();

    if (classifier) classifier.dispose();

    classifier = tf.sequential();

    classifier.add(
      tf.layers.dense({
        inputShape: [embeddingSize],
        units: 64,
        activation: "relu"
      })
    );

    classifier.add(
      tf.layers.dropout({ rate: 0.15 })
    );

    classifier.add(
      tf.layers.dense({
        units: classes.length,
        activation: "softmax"
      })
    );

    classifier.compile({
      optimizer: tf.train.adam(0.001),
      loss: "categoricalCrossentropy",
      metrics: ["accuracy"]
    });

    const epochs = Math.max(
      5,
      Math.min(80, Number($("epochs").value) || 25)
    );

    await classifier.fit(xs, ys, {
      epochs,
      batchSize: Math.min(16, features.length),
      shuffle: true,

      callbacks: {
        onEpochEnd: async (epoch, logs) => {

          $("progress-bar").style.width =
            `${Math.round((epoch + 1) / epochs * 100)}%`;

          const accuracy = logs.acc ?? logs.accuracy ?? 0;

          $("progress-label").textContent =
            `Trénovací průchod ${epoch + 1}/${epochs} · přesnost ${(accuracy * 100).toFixed(1)} %`;

          await tf.nextFrame();
        }
      }
    });

    xs.dispose();
    ys.dispose();

    $("status-dot").classList.add("ready");

    $("model-status").textContent =
      "Model je natrénovaný – můžeš spustit kameru.";

    $("start-test-camera").disabled = false;

    $("predictions").innerHTML =
      '<p class="prediction-empty">Model je připraven. Ukaž mu některý objekt.</p>';

    toast("Trénování dokončeno.");

  } catch (error) {

    console.error(error);

    $("model-status").textContent =
      "Trénování se nepodařilo.";

    toast(
      "Chyba při trénování: " +
      (error.message || "neznámá chyba")
    );

  } finally {

    trainingBusy = false;

    updateTrainButton();
  }
}


/* =========================================
   ROZPOZNÁVÁNÍ OBJEKTŮ
   ========================================= */

async function classifyFrame(video) {
  if (!classifier || classifyBusy || video.readyState < 2) return;

  classifyBusy = true;

  try {
    const { values } = await embeddingFrom(video);

    const input = tf.tensor2d([values]);

    const output = classifier.predict(input);

    const probabilities = Array.from(await output.data());

    input.dispose();
    output.dispose();

// Zachovat původní pořadí kategorií.
// Kategorie 1 vždy první, Kategorie 2 druhá,
// Kategorie 3 třetí – bez ohledu na pravděpodobnost.
const ranked = classes.map((item, index) => ({
  name: item.name,
  color: item.color,
  probability: probabilities[index]
}));

    $("predictions").innerHTML = ranked.map(item => `
      <div class="prediction-row">
        <div class="prediction-top">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${(item.probability * 100).toFixed(1)} %</span>
        </div>
        <div class="prediction-track">
          <div
            class="prediction-fill"
            style="width:${Math.max(0, Math.min(100, item.probability * 100))}%;background:${item.color}"
          ></div>
        </div>
      </div>
    `).join("");

  } catch (error) {

    console.warn(error);

  } finally {

    classifyBusy = false;
  }
}


/* =========================================
   ZABEZPEČENÍ TEXTU
   ========================================= */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}


/* =========================================
   TESTOVÁNÍ MODELU POMOCÍ KAMERY
   ========================================= */

async function startPreviewCamera(facing = previewFacing) {
  if (!classifier) {
    return toast("Nejprve natrénuj model.");
  }

  stopStream(previewStream);

  if (previewTimer) clearInterval(previewTimer);

  previewFacing = facing;

  try {
    previewStream = await requestCamera(facing, 960, 720);

    const video = $("test-video");

    video.srcObject = previewStream;

    video.hidden = false;

    await video.play();

    $("preview-content")
      .querySelector(".preview-placeholder")
      ?.remove();

    $("start-test-camera").hidden = true;

    $("switch-test-camera").hidden = false;

    $("stop-test-camera").hidden = false;

    $("preview-label").style.display = "inline";

    $("preview-content").style.minHeight = "0";

    previewTimer = setInterval(
      () => classifyFrame(video),
      700
    );

  } catch (error) {

    toast(
      "Kameru se nepodařilo otevřít. Zkontroluj oprávnění prohlížeče."
    );

    console.error(error);
  }
}

function stopPreviewCamera() {
  stopStream(previewStream);

  previewStream = null;

  if (previewTimer) clearInterval(previewTimer);

  previewTimer = null;

  const video = $("test-video");

  video.pause();

  video.srcObject = null;

  video.hidden = true;

  $("start-test-camera").hidden = false;

  $("switch-test-camera").hidden = true;

  $("stop-test-camera").hidden = true;

  $("preview-label").style.display = "none";

  $("preview-content").style.minHeight = "";

  $("preview-content")
    .querySelector(".preview-placeholder")
    ?.remove();

  const placeholder = document.createElement("div");

  placeholder.className = "preview-placeholder";

  placeholder.innerHTML =
    "<p>Kamera je zastavena. Spusť ji znovu pro další test.</p>";

  $("preview-content").prepend(placeholder);

  $("predictions").innerHTML =
    '<p class="prediction-empty">Pravděpodobnosti rozpoznání se zobrazí při spuštěné kameře.</p>';
}


/* =========================================
   OVLÁDACÍ PRVKY
   ========================================= */

// Přidání kategorie
$("add-class").addEventListener("click", () => addClass());

// Trénování modelu
$("train-button").addEventListener("click", trainModel);

// Zavření okna kamery
$("close-modal").addEventListener("click", closeCapture);

$("done-capturing").addEventListener("click", closeCapture);

// Zavření okna kliknutím mimo něj
$("camera-modal").addEventListener("click", event => {
  if (event.target === $("camera-modal")) {
    closeCapture();
  }
});

// Přepínání kamery při pořizování obrázků
$("switch-camera").addEventListener(
  "click",
  switchCaptureCamera
);

// Pořízení obrázku
$("capture-button").addEventListener(
  "click",
  captureExample
);

// Spuštění testovací kamery
$("start-test-camera").addEventListener(
  "click",
  () => startPreviewCamera(previewFacing)
);

// Přepínání testovací kamery
$("switch-test-camera").addEventListener(
  "click",
  () => startPreviewCamera(
    previewFacing === "environment" ? "user" : "environment"
  )
);

// Zastavení testovací kamery
$("stop-test-camera").addEventListener(
  "click",
  stopPreviewCamera
);

// Pokročilé nastavení
$("advanced-toggle").addEventListener("click", () => {
  const panel = $("advanced-content");

  const opening = panel.hidden;

  panel.hidden = !opening;

  $("advanced-toggle").setAttribute(
    "aria-expanded",
    String(opening)
  );

  $("advanced-toggle").querySelector("span").textContent =
    opening ? "⌃" : "⌄";
});


/* =========================================
   UKONČENÍ APLIKACE
   ========================================= */

window.addEventListener("beforeunload", () => {
  stopStream(captureStream);
  stopStream(previewStream);
});


/* =========================================
   VÝCHOZÍ KATEGORIE
   ========================================= */

addClass("Objekt č. 1");
addClass("Objekt č. 2");
