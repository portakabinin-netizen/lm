import sys
sys.path.append('.')
from scratch.replay_all_voucher import current_text

start_str = "    const isEmployee = (acc: any) => acc.type === 'Staff';"
start_m = current_text.find(start_str)
print("Start match index:", start_m)

end_str = "Cash Transfer</Text>\n                </TouchableOpacity>\n            </ScrollView>\n          </View>"
end_m = current_text.find(end_str)
print("End match index:", end_m)

if start_m != -1 and end_m != -1:
    block = current_text[start_m:end_m + len(end_str)]
    print("Block length:", len(block), "lines:", len(block.splitlines()))
