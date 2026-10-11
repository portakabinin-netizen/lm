import os
import json
import re

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"

def get_view_file_lines(session_id, step_index):
    tf = os.path.join(brain_dir, session_id, ".system_generated", "logs", "transcript_full.jsonl")
    res = {}
    with open(tf, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if f'"step_index":{step_index}' in line and '"type":"VIEW_FILE"' in line:
                obj = json.loads(line)
                c = obj.get("content", "")
                for l in c.splitlines():
                    m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                    if m:
                        res[int(m.group(1))] = m.group(2)
                break
    return res

def harvest_all_lines(session_id, total_lines):
    tf = os.path.join(brain_dir, session_id, ".system_generated", "logs", "transcript_full.jsonl")
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

# 1. Harvest base 4024 lines from 924d and c1868
lines_4024 = {}
lines_4024.update(harvest_all_lines("c1868f3b-9dde-4eb0-b055-98666af278ca", 4024))
lines_4024.update(harvest_all_lines("924d6424-27a0-4913-9bdf-a2ce3aee4056", 4024))

print("Harvested raw 4024 keys count:", len(lines_4024))

# 2. StaffListModal:
# Lines 1-779: from 4024
# Lines 780-958: StaffListModal
# In 964617eb: step 664 (760-860), step 666 (860-930).
# In 924d: step 236 (940-979).
s664 = get_view_file_lines("964617eb-49c1-45b7-ae8e-54b619636bc4", 664)
s666 = get_view_file_lines("964617eb-49c1-45b7-ae8e-54b619636bc4", 666)
s236 = get_view_file_lines("924d6424-27a0-4913-9bdf-a2ce3aee4056", 236)

# Build StaffListModal seamlessly:
# 780 to 860: s664 lines 773 to 859
staff_lines = []
for i in range(773, 860):
    if i in s664:
        staff_lines.append(s664[i])

# 860 to 925: s666 lines 860 to 925
for i in range(860, 926):
    if i in s666:
        staff_lines.append(s666[i])

# 942 to 958 in s236:
for i in range(942, 959):
    if i in s236:
        staff_lines.append(s236[i])

print(f"Constructed StaffListModal line count: {len(staff_lines)}")
for idx, l in enumerate(staff_lines, start=780):
    lines_4024[idx] = l

# 3. Gap 1271-1279:
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

# 4. Gap 2901-2949:
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
    "                  style={{",
    "                    width: '100%',",
    "                    maxWidth: 480,",
    "                    backgroundColor: isDark ? '#1e293b' : '#ffffff',",
    "                    borderTopLeftRadius: 24,",
    "                    borderTopRightRadius: 24,",
    "                    padding: 20,",
    "                    paddingBottom: 28,",
    "                    borderTopWidth: 1,",
    "                    borderColor: isDark ? '#334155' : '#e2e8f0',",
    "                  }}",
    "                >",
    "                  {/* Drag Indicator */}",
    "                  <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isDark ? '#475569' : '#cbd5e1', alignSelf: 'center', marginBottom: 16 }} />",
    "",
    "                  {/* Worker & Date Header */}",
    "                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>",
    "                    <View style={{",
    "                      width: 44,",
    "                      height: 44,",
    "                      borderRadius: 22,",
    "                      backgroundColor: COLORS.primary + '15',",
    "                      justifyContent: 'center',",
    "                      alignItems: 'center',",
    "                      marginRight: 12,",
    "                    }}>",
    "                      <Text style={{ fontSize: 16, fontWeight: '900', color: COLORS.primary }}>",
    "                        {dayActionModal.day}",
    "                      </Text>",
    "                    </View>",
    "                    <View style={{ flex: 1 }}>",
    "                      <Text style={{ fontSize: 16, fontWeight: '800', color: isDark ? '#fff' : '#0f172a' }}>",
    "                        {dayActionModal.worker.name}",
    "                      </Text>",
    "                      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>",
    "                        {dayActionModal.siteName} • Shift {dayActionModal.shiftCode} ({MONTHS[selectedMonth]} {dayActionModal.day}, {selectedYear})",
    "                      </Text>",
    "                    </View>",
    "                    <TouchableOpacity onPress={() => setDayActionModal(null)} style={{ padding: 4 }}>",
    "                      <Ionicons name=\"close-circle\" size={24} color={isDark ? '#94a3b8' : '#64748b'} />",
    "                    </TouchableOpacity>",
    "                  </View>",
    "",
    "                  {/* Current Status Banner */}",
    "                  <View style={{",
    "                    flexDirection: 'row',",
    "                    alignItems: 'center',",
    "                    backgroundColor: isDark ? '#0f172a' : '#f1f5f9',",
    "                    paddingHorizontal: 12,",
    "                    paddingVertical: 8,",
    "                    borderRadius: 10,",
    "                    marginBottom: 16,",
    "                  }}>",
    "                    <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>Current Status: </Text>",
    "                    <Text style={{",
    "                      fontSize: 12,",
    "                      fontWeight: '800',",
    "                      color: dayActionModal.logForDay",
    "                        ? (dayActionModal.logForDay.status === 'Weekly Off' ? '#2563eb' : dayActionModal.logForDay.status === 'Paid Leave' ? '#d97706' : '#15803d')",
    "                        : '#ef4444'",
    "                    }}>",
    "                      {dayActionModal.logForDay",
    "                        ? `${dayActionModal.logForDay.status || 'Present'}${dayActionModal.logForDay.dutyLevel === 0.5 ? ' (Half Day)' : ''}`",
    "                        : 'Absent (Not Logged)'}",
    "                    </Text>",
    "                  </View>",
    "",
    "                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 0.5, marginBottom: 10 }}>",
    "                    QUICK STATUS ACTIONS",
    "                  </Text>",
    "",
    "                  {/* 2-column Grid of Action Pills */}",
    "                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>",
    "                    {[",
    "                      { label: 'Present (P)', code: 'P', status: 'Present', level: 1, color: '#16a34a', bg: '#dcfce7' },",
    "                      { label: 'Half Day (P½)', code: 'P½', status: 'Present', level: 0.5, color: '#059669', bg: '#ecfdf5' },",
    "                      { label: 'Weekly Off (W)', code: 'W', status: 'Weekly Off', level: 1, color: '#2563eb', bg: '#eff6ff' },",
    "                      { label: 'Paid Leave (L)', code: 'L', status: 'Paid Leave', level: 1, color: '#d97706', bg: '#fef3c7' },",
    "                      { label: 'Absent (A)', code: 'A', status: 'Absent', level: 0, color: '#ef4444', bg: '#fee2e2' },",
    "                      { label: 'No Reliever (NR)', code: 'NR', status: 'NR', level: 0, color: '#7c3aed', bg: '#f3e8ff' },",
    "                    ].map((item) => (",
    "                      <TouchableOpacity",
    "                        key={item.label}",
    "                        onPress={async () => {",
    "                          const target = dayActionModal;",
    "                          setDayActionModal(null);",
    "                          const effectiveHeaders = await getEffectiveHeaders();",
    "                          applyStatus(",
    "                            item.status,",
    "                            item.level,",
    "                            target.worker,",
    "                            target.day,",
    "                            target.siteId,",
    "                            target.siteName,",
    "                            target.shiftCode,",
    "                            target.logForDay,",
    "                            target.targetDate,",
    "                            effectiveHeaders",
    "                          );",
    "                        }}",
    "                        style={{",
    "                          width: '48.5%',",
    "                          flexDirection: 'row',",
    "                          alignItems: 'center',",
    "                          paddingVertical: 10,",
    "                          paddingHorizontal: 12,",
    "                          borderRadius: 12,",
    "                          backgroundColor: isDark ? '#0f172a' : item.bg,",
    "                          borderWidth: 1.5,",
    "                          borderColor: item.color,",
    "                          gap: 8,",
    "                        }}",
    "                      >",
    "                        <View style={{",
    "                          width: 28,",
    "                          height: 28,",
    "                          borderRadius: 8,",
    "                          backgroundColor: item.color,",
    "                          justifyContent: 'center',",
    "                          alignItems: 'center',",
    "                        }}>",
    "                          <Text style={{ fontSize: 11, fontWeight: '900', color: '#fff' }}>{item.code}</Text>",
    "                        </View>",
    "                        <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#fff' : '#0f172a', flex: 1 }}>",
    "                          {item.label}",
    "                        </Text>",
    "                      </TouchableOpacity>",
    "                    ))}",
    "                  </View>",
]

# Note: In 4024 version, the DayActionModal starts around 2888.
# Let's write gap_2900_lines seamlessly!
# Let's inspect where lines_4024 ended before gap_2900_lines:
last_worker_line = 0
for k in sorted(lines_4024.keys()):
    if k < 2950 and "isWorkerExpanded" in lines_4024[k]:
        last_worker_line = k

print("Last worker expanded line in 4024:", last_worker_line)
