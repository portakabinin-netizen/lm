import os

with open("c:/hipk/scratch/FinancialComparisonLineChart_extracted.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# Add the final closing lines if needed
end_snippet = """                {fmtFull(isSurplus ? focusedMonth.inflow : focusedMonth.outflow)}
              </Text>
            </View>
          </View>
        </View>
      </SectionCard>
    );
  }
"""

if "Total Application" in text and not text.strip().endswith("}"):
    text = text.rstrip() + "\n" + end_snippet

with open("c:/hipk/scratch/FinancialComparisonLineChart_complete.tsx", "w", encoding="utf-8") as f:
    f.write(text)

print(f"Complete chart written, total lines: {len(text.splitlines())}")
print("Checking JSX tags...")
open_tags = text.count("<SectionCard")
close_tags = text.count("</SectionCard>")
print(f"SectionCard open: {open_tags}, close: {close_tags}")
print(f"Svg open: {text.count('<Svg')}, close: {text.count('</Svg>')}")
