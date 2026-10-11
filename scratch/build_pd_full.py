import os
import json
import re

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"

# 1. Harvest all lines from 924d6424 (Total lines: 4024)
lines_4024 = {}

def harvest(sid, total_lines):
    tf = os.path.join(brain_dir, sid, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(tf): return {}
    res = {}
    with open(tf, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
                obj = json.loads(line)
                c = obj.get("content", "")
                if f"Total Lines: {total_lines}" in c:
                    for l in c.splitlines():
                        m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                        if m:
                            res[int(m.group(1))] = m.group(2)
    return res

h_924d = harvest("924d6424-27a0-4913-9bdf-a2ce3aee4056", 4024)
h_c1868 = harvest("c1868f3b-9dde-4eb0-b055-98666af278ca", 4024)

# Combine: 924d is latest, c1868 fills earlier gaps
lines_4024.update(h_c1868)
lines_4024.update(h_924d)

# Fill 1271-1279
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
    lines_4024[idx] = l

# Read StaffListModal from current file
with open(r"c:\hipk\dashboards\ProjectDashboard.tsx", "r", encoding="utf-8", errors="ignore") as f:
    curr_file_lines = [l.rstrip("\r\n") for l in f.readlines()]

# Current file lines 558 to 729 correspond to lines 780 to 958 in 4024
for idx, l in enumerate(curr_file_lines[558:730], start=780):
    lines_4024[idx] = l

# Fill lines 2901-2949
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
for idx, l in enumerate(gap_2900_lines, start=2901):
    lines_4024[idx] = l

# Read Step 183 replacement content
tf_c1868 = os.path.join(brain_dir, "c1868f3b-9dde-4eb0-b055-98666af278ca", ".system_generated", "logs", "transcript_full.jsonl")
step183_rep = []
with open(tf_c1868, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"step_index":183' in line:
            obj = json.loads(line)
            step183_rep = obj["tool_calls"][0]["args"]["ReplacementContent"].splitlines()
            break

# In Step 183, line 0 is: "                {/* Custom Edit / Delete Option if Log Exists */}"
# In 4024 version, line 3004 is just before this!
for idx, l in enumerate(step183_rep, start=3005):
    lines_4024[idx] = l

# Fill addWorkerContext and closing of AttendanceLogModal up to 3370:
gap_3330_lines = [
    "                              }}",
    "                              style={{",
    "                                flexDirection: 'row',",
    "                                alignItems: 'center',",
    "                                paddingVertical: 12,",
    "                                borderBottomWidth: 1,",
    "                                borderBottomColor: isDark ? '#334155' : '#f1f5f9',",
    "                              }}",
    "                            >",
    "                              <View style={{",
    "                                width: 36,",
    "                                height: 36,",
    "                                borderRadius: 18,",
    "                                backgroundColor: isDark ? '#334155' : '#f1f5f9',",
    "                                justifyContent: 'center',",
    "                                alignItems: 'center',",
    "                                marginRight: 10,",
    "                                overflow: 'hidden',",
    "                              }}>",
    "                                {item.photo ? (",
    "                                  <Image source={{ uri: item.photo }} style={{ width: '100%', height: '100%' }} />",
    "                                ) : (",
    "                                  <Ionicons name=\"person\" size={18} color=\"#94a3b8\" />",
    "                                )}",
    "                              </View>",
    "                              <View style={{ flex: 1 }}>",
    "                                <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#fff' : '#0f172a' }}>",
    "                                  {item.name}",
    "                                </Text>",
    "                                <Text style={{ fontSize: 11, color: '#64748b' }}>",
    "                                  {item.role || 'Worker'} • {item.mobile || 'No mobile'}",
    "                                </Text>",
    "                              </View>",
    "                              <Ionicons name=\"add-circle\" size={24} color={COLORS.primary} />",
    "                            </TouchableOpacity>",
    "                          );",
    "                        }}",
    "                      />",
    "                    </View>",
    "                  </KeyboardAvoidingView>",
    "                </View>",
    "              </Modal>",
    "            )}",
    "          </SafeAreaView>",
    "        </Modal>",
    "      );",
    "    };",
]
for idx, l in enumerate(gap_3330_lines, start=3331):
    lines_4024[idx] = l

# Modals at the end: PenaltyRegisterModal (curr lines 1793-2036) and ProjectGalleryModal (curr lines 2037-2428)
end_modals = curr_file_lines[1793:]
for idx, l in enumerate(end_modals, start=3378):
    lines_4024[idx] = l

print(f"Total reconstructed base lines: {max(lines_4024.keys())}")
max_line = max(lines_4024.keys())
full_base_lines = []
for i in range(1, max_line + 1):
    full_base_lines.append(lines_4024.get(i, ""))

full_code = "\n".join(full_base_lines)

# Save base code to scratch
with open(r"c:\hipk\scratch\reconstructed_base_4024.tsx", "w", encoding="utf-8") as f:
    f.write(full_code)

print("Saved reconstructed_base_4024.tsx!")
