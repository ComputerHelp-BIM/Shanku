"""Regenerates the homepage screenshots (apps/web/public/home/shot-*-{paper,ink}.webp) from the running app.

    npm run build && npx vite preview --port 4174 -w @cad2bim/web     # in one terminal
    python tools/screenshots/home_shots.py [http://localhost:4174]    # in another (needs playwright, pillow)

Rerun it after a change to the app's look, so the homepage never shows an older app.
"""
import re
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

URL = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4174").rstrip("/")
OUT = Path(__file__).resolve().parents[2] / "apps/web/public/home"
SIZE = {"width": 1440, "height": 900}


def save(page, name: str, theme: str) -> None:
    png = page.screenshot()
    Image.open(BytesIO(png)).convert("RGB").save(OUT / f"{name}-{theme}.webp", "WEBP", quality=82, method=6)
    print(f"  {name}-{theme}.webp")


def open_view(page, label: str, under: str | None = None) -> None:
    browser = page.locator(".app-dock-panel").filter(has=page.locator(".app-browser-search")).first
    rows = browser.locator(".sk-tree__row").all_inner_texts()
    start = rows.index(next(r for r in rows if under in r)) if under else -1
    k = [i for i, r in enumerate(rows) if i > start and r.strip().startswith(label)][0]
    browser.locator(".sk-tree__row").nth(k).click()
    page.wait_for_timeout(1500)


def shots(page, theme: str) -> None:
    page.goto(f"{URL}/#app")
    page.wait_for_timeout(800)
    page.evaluate("localStorage.clear(); indexedDB.deleteDatabase('shanku')")
    page.reload()
    page.wait_for_timeout(1500)
    page.get_by_role("button", name=re.compile(r"G\+1 RCC Frame")).click()
    page.wait_for_function("() => document.querySelector('.app-compat')", timeout=60000)
    page.wait_for_timeout(2000)
    col = page.evaluate("() => window.__shankuViewer.model.elements.find(e => e.category === 'Column' && e.level === 'Level 2').globalId")
    search = page.get_by_label("Search commands, elements and IDs")

    # 3D: the workspace, a column selected (Properties shows it)
    search.fill(col)
    page.keyboard.press("Enter")
    page.wait_for_timeout(600)
    page.get_by_role("button", name="Fit", exact=True).click()
    page.wait_for_timeout(1200)
    save(page, "shot-3d", theme)

    # section box (BX) around a whole level: the Project browser's Levels → Level 1 selects it
    browser = page.locator(".app-dock-panel").filter(has=page.locator(".app-browser-search")).first
    browser.locator(".sk-tree__row", has_text=re.compile(r"^\s*Level 1 \(\d+\)")).first.click()
    page.wait_for_timeout(600)
    page.get_by_role("button", name=re.compile(r"^Section box: (On|Off)")).click()
    page.wait_for_timeout(1500)
    save(page, "shot-section", theme)
    page.get_by_role("button", name=re.compile(r"^Section box: (On|Off)")).click()
    page.wait_for_timeout(500)

    # BOQ window
    page.get_by_role("tab", name="Model").click()
    page.locator(".sk-ribbon").get_by_role("button", name="BOQ").click()
    page.wait_for_timeout(1500)
    save(page, "shot-boq", theme)
    page.get_by_role("button", name=re.compile(r"^Close Bill of quantities")).click()  # the window's own close button
    page.wait_for_timeout(500)

    # editing: Move a column in the Level 1 plan, mid-pick with the listening dimension
    open_view(page, "Level 1", "Structural Plans")
    search.fill(col)
    page.keyboard.press("Enter")
    page.wait_for_timeout(600)
    page.get_by_role("button", name="Fit", exact=True).click()  # finding the column zoomed to it: show the whole plan
    page.wait_for_timeout(1000)
    box = page.locator(".app-viewport canvas").first.bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx, cy)
    page.locator("body").press("M")
    page.locator("body").press("V")
    page.wait_for_timeout(400)
    page.mouse.move(cx - 120, cy + 60)
    page.wait_for_timeout(300)
    page.mouse.click(cx - 120, cy + 60)
    page.wait_for_timeout(300)
    page.mouse.move(cx + 90, cy + 61)
    page.wait_for_timeout(800)
    save(page, "shot-edit", theme)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        for theme, scheme in (("paper", "light"), ("ink", "dark")):
            print(theme)
            page = browser.new_page(viewport=SIZE, color_scheme=scheme)
            shots(page, theme)
            page.close()
        browser.close()


if __name__ == "__main__":
    main()
