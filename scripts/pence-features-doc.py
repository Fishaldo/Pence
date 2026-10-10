"""Write the downloadable Pence feature list. Re-run after any feature change."""

from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt, RGBColor

OUT = Path("/workspace/docs/Pence-features.docx")

SECTIONS = [
    (
        "Account",
        [
            "Email sign-in. A new person enters their name, monthly take-home pay, town or city, and payday.",
            "Settings can change those details, including whether spend reminders are wanted.",
            "Settings can save this phone’s location, and other places typed by hand, such as a partner in Essex. Plan and the shop comparison can use any of those places. Location is not required.",
        ],
    ),
    (
        "Adding a spend",
        [
            "Scan a receipt, pick photos from the gallery, or pick PDFs from Files. Up to 8 files. A PDF is read page by page, the first 4 pages.",
            "A receipt, photo or PDF, is read for the shop, date, total, and each line item. You can correct any of it before it is saved. Several receipts are checked one after another.",
            "A photo that is not a receipt or a list of payments is rejected.",
            "A photo or PDF of a bank or card list is accepted. Money in is ignored. Each money-out line can be kept or dropped, with a category.",
            "A wallet or bank alert can be pasted as text. Pence asks whether there is a receipt. If not, it files the spend from the alert.",
            "If a new receipt or statement line matches a payment already saved — same amount, same shop, and the same date — Pence asks whether to keep the saved one, replace it, or keep both. The same amount on a different date is not flagged.",
            "A spend can also be typed in by hand.",
            "Categories for a logged spend: Groceries, Household, Fashion, Entertainment, Dining, Transport, Health, Bills, Subscriptions, Personal care, Travel, Gifts, and Other.",
        ],
    ),
    (
        "Home",
        [
            "Home shows how much of the current pay is already spent. If payday is the 25th, that pay starts on the 25th of the previous month and runs until the day before the next 25th. With no payday set, it stays a calendar month.",
            "How the month is pacing against last month.",
            "Activity on Home lists the latest spends. All Activity opens the full list.",
        ],
    ),
    (
        "Activity",
        [
            "Every spend, grouped by day. A spend can be opened, edited, or deleted.",
            "The receipt image, when one was saved, stays with the spend.",
        ],
    ),
    (
        "Insights",
        [
            "Charts for where the month went, spending by day, and the past three months side by side.",
            "Each category as a share of take-home, and whether it is up or down.",
            "What to trim, from your own numbers, plus a closer written read when asked.",
            "Offers leads with the places already used for everyday spending, then other shops in those same habits. About thirty at a time, then More for the next thirty when they exist.",
            "Hot deals on Home are three posts trending across the UK. More opens the longer list, fifteen at a time, up to one hundred when that many exist.",
            "The schemes named in the app are Tesco Clubcard, Nectar, Lidl Plus, Aldi Super 6, Too Good To Go, Boots Advantage Card, and a note to check the ride price before you confirm.",
            "Another shop lists other big chains actually near this phone, with the distance. A price or an online offer is shown only when a page states it.",
        ],
    ),
    (
        "Plan",
        [
            "The What list on Plan stays on the lower part of the screen. Tap the dim area above it, or the phone’s back button, to close it.",
            "What it is, grouped as Food, Home, Getting around, Shopping, You, and Life. That includes rent, gas and electricity, water, broadband, a mobile contract, TV, council tax, insurance, repairs, furniture, the garden, fuel, parking, a car, a bike, driving lessons, a phone, fashion, gifts, health, personal care, a gym, sport such as a pitch or court, entertainment, hobbies, kids, childcare, pets, education, subscriptions, a wedding or party, moving house, charity, and something else.",
            "A UK plan stays on what was asked for. Deals in the named town come first, then nationwide deals for the same thing. More continues until that list runs out.",
            "A wider search of public pages follows. It is slow the first time. The same plan on the same day is saved and returns faster. A code or a price is shown only when that page prints it.",
        ],
    ),
    (
        "Deal boards",
        [
            "Offers come from anywhere public and legal in the UK: shop sites, Google, Reddit, forums, HotUKDeals, and other UK deal pages. Slickdeals is not used.",
            "LatestDeals, MoneySavingExpert, Groupon, Wowcher, and VoucherCodes are not connected. A person can open them in a browser, but those sites block the app from reading the deals.",
            "The wider offer search can still land on a deal site, Reddit, or a forum when that search actually opens the page.",
        ],
    ),
    (
        "Bank",
        [
            "Not a live bank connection. Google Pay, Apple Pay, PayPal, and Amex are not read automatically.",
            "You can paste or upload a CSV or a copied statement. A photo or PDF of a statement can also be added from Add. Duplicate lines are skipped.",
            "A live bank connection would be a separate Open Banking approval. That is not switched on.",
        ],
    ),
    (
        "Alerts",
        [
            "A pasted wallet alert waits until it is filed or dismissed. That inbox is not in the bottom bar.",
        ],
    ),
    (
        "How you move around",
        [
            "The bottom bar is Home, Plan, Add, Insights, and Offers.",
            "Activity on Home is the latest spends, with All Activity opening the full list. Settings is on Home. Bank import is in Settings.",
        ],
    ),
]


def main() -> None:
    doc = Document()
    for section in doc.sections:
        section.top_margin = Cm(1.8)
        section.bottom_margin = Cm(1.8)
        section.left_margin = Cm(2)
        section.right_margin = Cm(2)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = title.add_run("Pence")
    run.bold = True
    run.font.size = Pt(28)
    run.font.color.rgb = RGBColor(0x1C, 0x3A, 0x2E)

    sub = doc.add_paragraph()
    sub_run = sub.add_run("Every feature in the current version")
    sub_run.font.size = Pt(14)
    sub_run.font.color.rgb = RGBColor(0x4A, 0x55, 0x4E)

    dated = doc.add_paragraph()
    dated_run = dated.add_run("5 October 2026")
    dated_run.italic = True
    dated_run.font.size = Pt(11)
    dated_run.font.color.rgb = RGBColor(0x4A, 0x55, 0x4E)

    intro = doc.add_paragraph()
    intro_run = intro.add_run(
        "Pence is a personal spending app in pounds. You sign in and see only your own spends. "
        "It shows where the money went, and it shows an offer only when a public page or a deal board states it."
    )
    intro_run.font.size = Pt(12)

    for heading, lines in SECTIONS:
        h = doc.add_heading(heading, level=1)
        for paragraph in h.runs:
            paragraph.font.color.rgb = RGBColor(0x1C, 0x3A, 0x2E)
        for line in lines:
            bullet = doc.add_paragraph(line, style="List Bullet")
            for paragraph in bullet.runs:
                paragraph.font.size = Pt(12)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
