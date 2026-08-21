from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
source = root / "tmp" / "pdfs" / "university-council" / "extracted.txt"
target = root / "docs" / "university-council-regulation-full-ar.md"
text = source.read_text(encoding="utf-8")

# Repair glyphs produced by the PDF's legacy Arabic font mapping.
text = text.replace("\u064c", "\u064a").replace("\u063e", "\u0641").replace("\u063c", "\u063a")
text = text.replace("0216\u0645", "2018\u0645").replace("5002\u0645", "2005\u0645")
text = text.replace("0223\u0645", "2005\u0645").replace("5032\u0645", "2018\u0645")

material_numbers = {
    1: [1, 2], 2: [3, 4, 5], 3: [6, 7, 8, 9, 10], 4: [11, 12, 13, 14],
    5: [], 6: [15], 7: [], 8: [41, 42, 43, 44, 45],
    9: [46, 47, 48, 49, 50, 51, 52], 10: [53],
}
parts = re.split(r"(?m)^===== PAGE (\d+) =====\s*$", text)
pages = []
pattern = re.compile(r"\u0645\u0627\u062f\u0629\s*\(?\s*\d+\s*:?[)\u061b:]?")
for index in range(1, len(parts), 2):
    page_no = int(parts[index])
    numbers = iter(material_numbers[page_no])
    body = pattern.sub(lambda match: f"\u0645\u0627\u062f\u0629({next(numbers)}):", parts[index + 1], count=len(material_numbers[page_no]))
    pages.append(body.strip())

heading = (
    "# \u0644\u0627\u0626\u062d\u0629 \u0627\u0644\u0645\u062c\u0627\u0644\u0633 \u0628\u062c\u0627\u0645\u0639\u0629 \u0627\u0644\u0631\u0627\u0632\u064a - \u0627\u0644\u0646\u0635 \u0627\u0644\u0643\u0627\u0645\u0644\n\n"
    "> \u062a\u0641\u0631\u064a\u063a \u0645\u0646 \u0642\u0631\u0627\u0631 \u0627\u0639\u062a\u0645\u0627\u062f \u0644\u0627\u0626\u062d\u0629 \u0627\u0644\u0645\u062c\u0627\u0644\u0633 \u0628\u0627\u0644\u062c\u0627\u0645\u0639\u0629 \u0644\u0633\u0646\u0629 2018\u0645. "
    "\u062d\u0648\u0641\u0638 \u062a\u0631\u062a\u064a\u0628 \u0627\u0644\u0645\u0648\u0627\u062f \u0643\u0645\u0627 \u064a\u0638\u0647\u0631 \u0641\u064a \u0627\u0644\u0645\u0635\u062f\u0631.\n\n"
)
target.write_text(heading + "\n\n".join(pages) + "\n", encoding="utf-8")
print(target)
