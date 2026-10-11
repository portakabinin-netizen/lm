import json, os, re, sys
sys.path.append('.')

from scratch.check_harvested import ranges, lines_dict

print(f"Direct lines captured in lines_dict: {len(lines_dict)}")

# Now for each of the 10 ranges, let's fill them:

# Gap 1: 121 to 129 (LeadItem TouchableOpacity props)
# Line 120: <TouchableOpacity
gap1 = [
    "    onPress={() => onSelect(item)}",
    "    style={{",
    "      paddingVertical: 12,",
    "      borderBottomWidth: 1,",
    "      borderBottomColor: '#f1f5f9',",
    "      flexDirection: 'row',",
    "      alignItems: 'center',",
    "      justifyContent: 'space-between',",
    "    }}",
]
for offset, l in enumerate(gap1):
    lines_dict[121 + offset] = l

# Gap 2: 196 to 199
# Line 195: const [allWorkers, setAllWorkers] = useState<any[]>([]);
# Line 200: const [ledgersLoading, setLedgersLoading] = useState(false);
gap2 = [
    "  const [accountingMaster, setAccountingMaster] = useState<any>({ groups: [], ledgers: [] });",
    "  const [accountPickerVisible, setAccountPickerVisible] = useState(false);",
    "  const [leadPickerVisible, setLeadPickerVisible] = useState(false);",
    "  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);",
]
for offset, l in enumerate(gap2):
    lines_dict[196 + offset] = l

# Gap 3: 261 to 299 (revenueAndSalesLedgers from 36afcdb8 Step 481)
# Line 260: const name = (g.groupName || '').toLowerCase();
# Line 300: ];
p_36 = r"C:\Users\herry\.gemini\antigravity-ide\brain\36afcdb8-d594-4610-b09e-afe11607ccbc\.system_generated\logs\transcript_full.jsonl"
with open(p_36, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") == 481:
            for tc in d.get("tool_calls", []):
                rc = tc.get("args", {}).get("ReplacementContent", "")
                rc_lines = rc.splitlines()
                # Find matching slice
                for idx, rl in enumerate(rc_lines):
                    if "nature === 'revenue'" in rl:
                        # Extract lines until matchingLedgers
                        slice_lines = rc_lines[idx:idx + 39]
                        for offset, sl in enumerate(slice_lines):
                            lines_dict[261 + offset] = sl
                        break

# Gap 4: 521 to 599
# Line 520: role.includes('admin') ||
# Line 600: };
# Let's inspect where isAdminOrFinance and allAccounts are defined
with open(p_36, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") == 426 and d.get("type") == "VIEW_FILE":
            c = d.get("content", "")
            for l in c.splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    num = int(m.group(1))
                    if 521 <= num <= 599 and num not in lines_dict:
                        lines_dict[num] = m.group(2)

# Gap 5: 701 to 829
# Line 700: ''
# Line 830: if (mode === 'contra') {
# In 36afcdb8, view 472, 474, 476, 488, 490 viewed 685-950
with open(p_36, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") in (428, 472, 474, 476, 488, 490) and d.get("type") == "VIEW_FILE":
            c = d.get("content", "")
            for l in c.splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    num = int(m.group(1))
                    if 701 <= num <= 829 and num not in lines_dict:
                        lines_dict[num] = m.group(2)

# Gap 6: 866 to 869
# Line 865: accountType: effectiveType,
# Line 870: const linkedLeadId = matchAny.isLedgerAccount ? matchAny.leadId : matchAny.id;
gap6 = [
    "        };",
    "        if (matchAny.type === 'Lead') {",
    "          entryUpdates.leadId = matchAny.id;",
    "          entryUpdates.leadName = matchAny.name;",
]
for offset, l in enumerate(gap6):
    lines_dict[866 + offset] = l

# Gap 7: 1091 to 1099
# Line 1090: <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Accounting Voucher Creation</Text>
# Line 1100: <View style={{ backgroundColor: '#D1E4F9', borderBottomWidth: 1, borderBottomColor: '#ccc' }}>
gap7 = [
    "            <TouchableOpacity onPress={() => multipleCorporates && setCorpSelectorVisible(true)} style={{ paddingHorizontal: 4 }}>",
    "              <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>{user?.corporateName || ''}</Text>",
    "            </TouchableOpacity>",
    "            <TouchableOpacity onPress={onClose} style={{ padding: 2 }}>",
    "              <Ionicons name=\"close\" size={18} color=\"#fff\" />",
    "            </TouchableOpacity>",
    "          </View>",
    "",
    "          {/* SUB BANNER (F2 Date & Mode title) */}",
]
for offset, l in enumerate(gap7):
    lines_dict[1091 + offset] = l

# Gap 8: 1171 to 1219 (voucher.entries grid, remove row, add row, narration)
# Let's inspect step 315 from c7e1b051 or 875 from 89d39ee6
p_c7 = r"C:\Users\herry\.gemini\antigravity-ide\brain\c7e1b051-8b6d-4cde-950c-c303c5a89ff7\.system_generated\logs\transcript_full.jsonl"
grid_lines = []
with open(p_c7, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") == 315 and d.get("type") == "VIEW_FILE":
            c = d.get("content", "")
            for l in c.splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    num = int(m.group(1))
                    if 964 <= num <= 992:
                        grid_lines.append(m.group(2))

print(f"Grid lines harvested from c7e1: {len(grid_lines)}")
# We can match them into Gap 8 (1171 to 1219)
# Let's inspect what lines were in 9c978313 around 1170 and 1220
with open(r"C:\Users\herry\.gemini\antigravity-ide\brain\9c978313-6497-4767-b550-f862269faef2\.system_generated\logs\transcript_full.jsonl", "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("type") == "VIEW_FILE" and "VoucherEntryModal.tsx" in line:
            c = d.get("content", "")
            for l in c.splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    num = int(m.group(1))
                    if 1170 <= num <= 1220 and num not in lines_dict:
                        lines_dict[num] = m.group(2)

print(f"After 9c97 check, direct lines captured: {len(lines_dict)}")

# Let's check how many missing remain
missing_now = [i for i in range(1, 1484) if i not in lines_dict]
print(f"Missing lines count now: {len(missing_now)}")
if missing_now:
    print("Remaining missing:", missing_now[:50])
