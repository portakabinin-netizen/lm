import re

target_path = r"c:\hipk\UtilServices\BackgroundTasks.ts"

with open(target_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace the broken block
old_block = """                      senderId: dutyInfo.employeeId,
                      text: message,
            console.log(`[GEO_TASK] Pruning expired alarm: ${alarm.key}`);
            continue;
          }

          // Fire if fire time has been reached and hasn't fired yet
          if (now >= alarm.fireAtMs) {
            console.log(`[GEO_TASK] 🔔 Firing missed-shift alarm [${alarm.window}]: ${alarm.siteName} - ${alarm.shiftName}`);
            try {
              const { alarmService } = require('@/services/AlarmService');
              await alarmService.startAlarm();
              firedCount++;
            } catch (alarmErr) {
              console.warn('[GEO_TASK] Alarm fire failed:', alarmErr);
            }
            // Do NOT carry this entry forward — it fired, discard it
          } else {
            // Still in the future — keep it
            remaining.push(alarm);
          }
      const { logGeoTickToSQLite } = require("@/UtilServices/sqliteService");"""

new_block = """                      senderId: dutyInfo.employeeId,
                      text: message,
                      type: 'text',
                      isOneToOne: true,
                      receiverId: recipient._id,
                    }),
                  })
                )
              );
              console.log(`[GEO_TASK] OOB alert sent to ${recipients.length} recipients.`);
            }
          }
        } catch (err) {
          console.warn('[GEO_TASK] Error sending OOB notification:', err);
        }
      }
    }

    // Log to SQLite diagnostic cache
    try {
      const { logGeoTickToSQLite } = require("@/UtilServices/sqliteService");"""

if old_block in content:
    content = content.replace(old_block, new_block)
    with open(target_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Replaced successfully!")
else:
    print("Old block not found!")
