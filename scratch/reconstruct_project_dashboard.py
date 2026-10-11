import os
import json
import re

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"

# 1. Harvest all lines from 924d6424 (Total lines: 4024)
lines_map = {}

def add_lines_from_session(sid, expected_total):
    tf = os.path.join(brain_dir, sid, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(tf): return
    with open(tf, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
                obj = json.loads(line)
                c = obj.get("content", "")
                if f"Total Lines: {expected_total}" in c:
                    for l in c.splitlines():
                        m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                        if m:
                            num = int(m.group(1))
                            if num not in lines_map:
                                lines_map[num] = m.group(2)

add_lines_from_session("924d6424-27a0-4913-9bdf-a2ce3aee4056", 4024)
add_lines_from_session("c1868f3b-9dde-4eb0-b055-98666af278ca", 4024)
add_lines_from_session("51de807f-d55d-4095-bf41-e5d0ad1fece9", 4024)

print(f"Direct lines from 4024 sessions: {len(lines_map)}")

# 2. Fill lines 1220 to 1340 from Step 406 of c1868f3b (where activeStaffRes was merged)
# We already have lines 1220-1270 and 1280-1340 from direct views.
# The gap 1271-1279:
gap_1270_lines = [
    "          const logD = (l.date || l.dutyStart) ? new Date(l.date || l.dutyStart) : null;",
    "          const isThisMonth = logD && !isNaN(logD.getTime())",
    "            ? (logD.getFullYear() === selectedYear && logD.getMonth() === selectedMonth)",
    "            : false;",
    "",
    "          if (isThisMonth || (isCurrentMonth && isActive)) {",
    "            const activeLog = { ...l, status: l.status || 'Present' };",
    "            const existing = logMap.get(k) || {};",
    "            logMap.set(k, { ...existing, ...activeLog });",
]
for idx, l in enumerate(gap_1270_lines, start=1271):
    lines_map[idx] = l

# 3. StaffListModal lines 801 to 939:
# Lines 780 to 958 in 4024 lines correspond to StaffListModal in current ProjectDashboard.tsx
# Let's read StaffListModal from current ProjectDashboard.tsx
with open(r"c:\hipk\dashboards\ProjectDashboard.tsx", "r", encoding="utf-8", errors="ignore") as f:
    curr_lines = [l.rstrip("\r\n") for l in f.readlines()]

# Find StaffListModal in curr_lines:
s_start = 558 # line 559: const StaffListModal: React.FC<StaffListModalProps> = ...
s_end = 729   # line 730: };

# In 4024: line 780 is const StaffListModal: React.FC<StaffListModalProps> = ...
# line 958 is };
curr_staff_lines = curr_lines[s_start:s_end+1]
for idx, l in enumerate(curr_staff_lines, start=780):
    lines_map[idx] = l

# 4. In AttendanceLogModal, lines 2901 to 2949:
gap_2900_lines = [
    "                                            </View>",
    "                                            <Ionicons",
    "                                              name={isWorkerExpanded ? 'chevron-up' : 'chevron-down'}",
    "                                              size={18}",
    "                                              color=\"#94a3b8\"",
    "                                            />",
    "                                          </TouchableOpacity>",
    "",
    "                                          {/* Monthly Worker Duty Card */}",
    "                                          {isWorkerExpanded && (",
    "                                            <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>",
    "                                              {renderMonthCalendar(worker._id || worker.id, site.siteId, shift.shiftCode)}",
    "                                            </View>",
    "                                          )}",
    "                                        </View>",
    "                                      );",
    "                                    })}",
    "                                  </View>",
    "                                )}",
    "                              </View>",
    "                            );",
    "                          })}",
    "                        </View>",
    "                      )}",
    "                    </View>",
    "                  );",
    "                }}",
    "              />",
    "            </View>",
    "",
    "            {/* Day Action Modal */}",
    "            <Modal",
    "              visible={!!dayActionModal}",
    "              transparent",
    "              animationType=\"fade\"",
    "              onRequestClose={() => setDayActionModal(null)}",
    "            >",
    "              <View",
    "                style={{",
    "                  flex: 1,",
    "                  backgroundColor: 'rgba(0,0,0,0.5)',",
    "                  justifyContent: 'flex-end',",
    "                  alignItems: 'center',",
    "                }}",
    "              >",
    "                <TouchableOpacity",
    "                  activeOpacity={1}",
]
# Let's align lines 2901 to 2949
for idx, l in enumerate(gap_2900_lines, start=2901):
    lines_map[idx] = l

# 5. DayActionModal and EditingLogModal (lines 3000 to 3260):
# Step 183 ReplacementContent gives the exact lines for 3005-3156:
tf_c1868 = os.path.join(brain_dir, "c1868f3b-9dde-4eb0-b055-98666af278ca", ".system_generated", "logs", "transcript_full.jsonl")
step183_rep = None
with open(tf_c1868, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"step_index":183' in line:
            obj = json.loads(line)
            step183_rep = obj["tool_calls"][0]["args"]["ReplacementContent"].splitlines()
            break

if step183_rep:
    # In Step 183: StartLine was 3005, and EndLine was 3092. Repl was 152 lines.
    # Notice that line 3014 in step 432 was:
    # {dayActionModal.logForDay ? `${dayActionModal.logForDay.status || 'Present'}${dayActionModal.logForDay.dutyLevel === 0.5 ? ' (Half Day)' : ''}` : 'Absent (Not Logged)'}
    # Let's find where step183_rep starts relative to dayActionModal
    for i, l in enumerate(step183_rep):
        # find matching line
        pass

print("Lines map length before closing:", len(lines_map))
