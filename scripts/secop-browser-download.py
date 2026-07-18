"""
SECOP Download final: browser captcha bypass + descarga PDF + doc2md + LLM
"""
import asyncio, json, os, re, sys, tempfile, httpx
from playwright.async_api import async_playwright

TWOCAPTCHA_BASE = "https://2captcha.com"
CAPTCHA_API_KEY = os.environ.get("CAPTCHA_SOLVER_API_KEY", "")
SECOP_BASE = "https://community.secop.gov.co"

# Licitacion Publica con pliegos
PROCESS_URL = "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.10229160"

async def solve_captcha(sitekey: str, page_url: str) -> str | None:
    if not CAPTCHA_API_KEY: return None
    async with httpx.AsyncClient(timeout=120) as client:
        in_url = f"{TWOCAPTCHA_BASE}/in.php?key={CAPTCHA_API_KEY}&method=userrecaptcha&googlekey={sitekey}&pageurl={page_url}&json=1"
        in_res = await client.get(in_url)
        in_data = in_res.json()
        if in_data.get("status") != 1: return None
        captcha_id = in_data["request"]
        poll_url = f"{TWOCAPTCHA_BASE}/res.php?key={CAPTCHA_API_KEY}&action=get&id={captcha_id}&json=1"
        for i in range(60):
            await asyncio.sleep(2)
            poll_res = await client.get(poll_url)
            poll_data = poll_res.json()
            if poll_data.get("status") == 1: return poll_data["request"]
            if poll_data.get("request") == "ERROR_CAPTCHA_UNSOLVABLE": return None
        return None

async def main():
    print("=" * 60)
    print("SECOP FLUJO COMPLETO FINAL")
    print("=" * 60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            locale="es-CO",
        )
        page = await context.new_page()
        
        print(f"\n[1/6] Navegando a proceso...")
        await page.goto(PROCESS_URL, wait_until="networkidle", timeout=30000)
        html = await page.content()
        
        # Detectar y resolver captcha
        if "ReCaptcha" in await page.title() or "g-recaptcha" in html:
            print("[2/6] Resolviendo ReCaptcha via 2captcha...")
            sitekey = re.search(r'data-sitekey=["\']([^"\']+)["\']', html)
            if not sitekey:
                print("ERROR: No sitekey found")
                await browser.close()
                return
            token = await solve_captcha(sitekey.group(1), page.url)
            if not token:
                print("ERROR: Captcha no resuelto")
                await browser.close()
                return
            print(f"  Token obtenido ({(len(token))} chars)")
            
            # Inyectar en DOM
            await page.evaluate(f"""
                document.getElementById('g-recaptcha-response').innerHTML = '{token}';
                document.getElementById('g-recaptcha-response').value = '{token}';
                var el = document.getElementById('txaresponseKey');
                if (el) el.value = '{token}';
            """)
            
            # Click submit y esperar navegacion
            async def wait_nav():
                try:
                    await page.wait_for_url("**/OpportunityDetail/Index**", timeout=15000)
                    return True
                except: return False
            nav_task = asyncio.create_task(wait_nav())
            try: await page.click("#btnCaptchaCheckButton", timeout=5000)
            except: await page.evaluate("onSubmit()")
            navigated = await nav_task
            await asyncio.sleep(2)
            
            if not navigated:
                print("ERROR: No navego despues del captcha")
                await browser.close()
                return
            print("  Captcha bypass OK - pagina real cargada")
        
        # Obtener HTML real
        html = await page.content()
        
        # Extraer FileIds del patron CORRECTO
        print("\n[3/6] Extrayendo documentos...")
        # Patron real: 'documentFileId=' + '781663566' + '&amp;mkey=...'
        # (JavaScript string concatenation + HTML entity encoding)
        doc_pattern = r"documentFileId=\s*'\s*\+\s*'(\d+)'\s*\+"
        file_ids = list(dict.fromkeys(re.findall(doc_pattern, html)))
        print(f"  FileIds encontrados: {len(file_ids)}")
        for fid in file_ids[:5]:
            print(f"    - {fid}")
        
        # Extraer mkey (en HTML aparece como &amp;mkey=...)
        mkey_m = re.search(r'[&amp;]mkey=([a-f0-9_]{36})', html)
        mkey = mkey_m.group(1) if mkey_m else ""
        print(f"  Mkey: {mkey[:20]}...")
        
        # Extraer nombres de documentos
        doc_names = re.findall(r'DocumentName_\d+"[^>]*>([^<]+)', html)
        print(f"\n  Nombres de documentos ({len(doc_names)} encontrados):")
        for i, (fid, name) in enumerate(zip(file_ids[:10], doc_names[:10])):
            print(f"    [{i+1}] {name.strip()[:80]} (FileId: {fid})")
        
        if not file_ids:
            print("  No se encontraron documentos!")
            await browser.close()
            return
        
        # Cookies del browser
        cookies = await context.cookies()
        cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
        
        # Descargar PRIMER documento (pliego principal)
        print(f"\n[4/6] Descargando documento 1 (FileId={file_ids[0]})...")
        import urllib.parse
        download_url = f"{SECOP_BASE}/Public/Tendering/OpportunityDetail/DownloadFile?documentFileId={file_ids[0]}&mkey={mkey}"
        print(f"  URL: {download_url[:100]}...")
        
        async with httpx.AsyncClient() as client:
            # Step 1: get the redirect page
            pdf_res = await client.get(
                download_url,
                cookies={c['name']: c['value'] for c in cookies},
                headers={"User-Agent": "Mozilla/5.0", "Referer": PROCESS_URL},
                follow_redirects=True
            )
            
            print(f"  HTTP {pdf_res.status_code}, Content-Type: {pdf_res.headers.get('content-type','?')}, Size: {len(pdf_res.content)} bytes")
            
            # Check for JS redirect
            body_text = pdf_res.text
            js_redirect = re.search(r"window\.location\.href\s*=\s*'([^']+)'", body_text)
            if js_redirect:
                real_url = f"{SECOP_BASE}{js_redirect.group(1)}"
                print(f"  JS redirect detectado, siguiendo a: {real_url[:120]}")
                pdf_res = await client.get(
                    real_url,
                    cookies={c['name']: c['value'] for c in cookies},
                    headers={"User-Agent": "Mozilla/5.0", "Referer": download_url},
                    follow_redirects=True
                )
                print(f"  HTTP {pdf_res.status_code}, Content-Type: {pdf_res.headers.get('content-type','?')}, Size: {len(pdf_res.content)} bytes")
            
            # Extraer filename real del Content-Disposition
            cd = pdf_res.headers.get('content-disposition', '')
            real_name = re.search(r'filename="([^"]+)"', cd)
            orig_filename = real_name.group(1) if real_name else f"document_{file_ids[0]}"
            ext = os.path.splitext(orig_filename)[1].lower()
            
            # Guardar el archivo original
            doc_path = os.path.join(tempfile.gettempdir(), f"secop_pliego_{file_ids[0]}{ext}")
            with open(doc_path, "wb") as f:
                f.write(pdf_res.content)
            print(f"  [OK] Archivo guardado: {doc_path} ({len(pdf_res.content) // 1024} KB, type: {ext})")
            
            # Convertir a Markdown via doc2md (soporta PDF, DOCX, XLSX, etc.)
            doc2md_data = None
            llm_result = None
            
            print(f"\n[5/6] Convirtiendo a Markdown via doc2md...")
            import base64
            b64 = base64.b64encode(pdf_res.content).decode()
            async with httpx.AsyncClient(base_url="http://localhost:8001", timeout=300) as client:
                conv_res = await client.post("/convert-file", json={
                    "content": b64,
                    "filename": orig_filename,
                    "timeout": 300
                })
                if conv_res.status_code == 200:
                    doc2md_data = conv_res.json()
                    markdown = doc2md_data.get("markdown", "")
                    print(f"  Engine: {doc2md_data.get('metadata',{}).get('engine','?')}")
                    print(f"  Pages: {doc2md_data.get('metadata',{}).get('pages','?')}")
                    print(f"  Markdown: {len(markdown)} chars")
                    if markdown:
                        md_path = os.path.join(tempfile.gettempdir(), "secop_pliego_markdown.md")
                        with open(md_path, "w", encoding="utf-8") as f:
                            f.write(markdown)
                        print(f"  Markdown guardado: {md_path}")
                else:
                    print(f"  doc2md error: HTTP {conv_res.status_code}")
                    body = await conv_res.aread()
                    print(f"  Body: {body[:200]}")
        
        # Analizar con LLM
        if doc2md_data and doc2md_data.get("markdown"):
            print(f"\n[6/6] Analizando con GPT-4o-mini...")
            openrouter_key = os.environ.get("OPENROUTER_API_KEY", "")
            if openrouter_key:
                async with httpx.AsyncClient(timeout=60) as client:
                    llm_res = await client.post("https://openrouter.ai/api/v1/chat/completions", json={
                        "model": "openai/gpt-4o-mini",
                        "messages": [
                            {"role": "system", "content": "Eres un analista de contratacion publica en Colombia. Extrae en JSON valido: REQUISITOS_HABILITANTES, GARANTIAS, CRONOGRAMA, FORMA_PAGO, EXPERIENCIA_REQUERIDA, RIESGOS, RESUMEN."},
                            {"role": "user", "content": f"Documento SECOP:\n\n{doc2md_data['markdown'][:20000]}"}
                        ],
                        "max_tokens": 2000,
                    }, headers={
                        "Authorization": f"Bearer {openrouter_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://secop-intelligence.app",
                    })
                    llm_result = llm_res.json()
                    analysis = llm_result.get("choices", [{}])[0].get("message", {}).get("content", "Sin respuesta")
                    print(f"  Analisis completado:\n{analysis[:800]}...")
                    analysis_path = os.path.join(tempfile.gettempdir(), "secop_llm_analysis_final.json")
                    with open(analysis_path, "w", encoding="utf-8") as f:
                        json.dump({"analysis": analysis, "fileIds": file_ids, "metadata": doc2md_data.get("metadata")}, f, indent=2)
                    print(f"  Analisis guardado: {analysis_path}")
        
        print(f"\n{'='*60}")
        print("FLUJO COMPLETO FINALIZADO EXITOSAMENTE")
        print(f"{'='*60}")
        print(f"\nDocumentos encontrados: {len(file_ids)}")
        print(f"FileIds: {', '.join(file_ids[:5])}{'...' if len(file_ids) > 5 else ''}")
        if doc2md_data:
            print(f"\nConversion: {doc2md_data.get('metadata',{}).get('engine','?')}")
            print(f"Paginas: {doc2md_data.get('metadata',{}).get('pages','?')}")
        if llm_result:
            print(f"LLM Analysis: COMPLETO")
        print(f"\nPresupuesto captchas usado: ~${len(file_ids) * 2 * 0.001:.3f}")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
