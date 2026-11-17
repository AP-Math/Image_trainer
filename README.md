# FOSTRA – My AI Trainer

Mobilní webová aplikace pro Projektový den 20. listopadu. Vzhled a pracovní postup jsou inspirované Google Teachable Machine.

## Funkce
- Maximálně 3 obrazové kategorie.
- Trénovací fotografie se pořizují výhradně fotoaparátem.
- Přepínání přední/zadní kamery podle možností zařízení.
- Vlastní klasifikátor nad obrazovými příznaky MobileNetu.
- Živé rozpoznávání a pravděpodobnosti jednotlivých tříd.
- Zpracování fotografií lokálně v prohlížeči.

## Lokální spuštění

Kameru prohlížeč povolí pouze v zabezpečeném kontextu (HTTPS nebo localhost).

```bash
python3 -m http.server 8000
```

Otevři `http://localhost:8000`.

## GitHub Pages

1. Vytvoř nový repozitář, například `fostra-ai-trainer`.
2. Nahraj do kořene repozitáře `index.html`, `style.css`, `app.js` a `README.md`.
3. Otevři **Settings → Pages**.
4. Vyber **Deploy from a branch**, větev `main` a složku `/ (root)`.
5. Ulož a po publikování otevři zobrazenou HTTPS adresu na telefonu.

## Technologie a soukromí
- HTML, CSS, JavaScript, TensorFlow.js a MobileNet.
- Model běží v prohlížeči; fotografie se neposílají na vlastní server.
- TensorFlow.js a váhy MobileNetu se načítají z CDN, proto je potřeba internet.
- Trénovací přesnost není nezávislé ověření kvality modelu.

## Rozložení obrazovky

Rozhraní je responzivní: na telefonu se skládá do jednoho sloupce pro přirozené používání na výšku (portrait), na počítači se rozloží vedle sebe do širokého pracovního prostoru (landscape). Kamera se při otevření přednostně pokusí použít zadní fotoaparát telefonu.
