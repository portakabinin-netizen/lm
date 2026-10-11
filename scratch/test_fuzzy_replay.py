import json, os, re, sys
sys.path.append('.')

from scratch.replay_all_voucher import base_text, all_edits

def normalize(s):
    return s.replace("\r\n", "\n")

text = base_text

for edit_idx, (label, sid, step, name, args) in enumerate(all_edits):
    desc = args.get("Description", "")[:50]
    if name == "replace_file_content":
        tgt = normalize(args.get("TargetContent", ""))
        rep = normalize(args.get("ReplacementContent", ""))
        if tgt in text:
            text = text.replace(tgt, rep, 1)
            print(f"[OK] {edit_idx}: [{label}] Step {step} replace - {desc}")
        else:
            # Let's inspect where the mismatch is
            t_lines = tgt.splitlines()
            c_lines = text.splitlines()
            found = False
            for i in range(len(c_lines) - len(t_lines) + 1):
                # match first line
                if t_lines[0].strip() and t_lines[0].strip() == c_lines[i].strip():
                    # check match ratio
                    matches = sum(1 for k in range(len(t_lines)) if t_lines[k].strip() == c_lines[i+k].strip())
                    if matches >= len(t_lines) * 0.9: # 90% match
                        print(f"[FUZZY-MATCH] {edit_idx}: [{label}] Step {step} at line {i} (matches {matches}/{len(t_lines)})")
                        # Show what differed
                        diffs = [(k, t_lines[k], c_lines[i+k]) for k in range(len(t_lines)) if t_lines[k].strip() != c_lines[i+k].strip()]
                        print(f"  Diff count: {len(diffs)}")
                        for dk, dt, dc in diffs[:3]:
                            print(f"    Line {dk}: tgt={repr(dt)} vs cur={repr(dc)}")
                        found = True
                        # Replace the matched block
                        matched_cur_block = "\n".join(c_lines[i:i+len(t_lines)])
                        text = text.replace(matched_cur_block, rep, 1)
                        print(f"  -> Applied replacement using matched_cur_block!")
                        break
            if not found:
                print(f"[FAILED] {edit_idx}: [{label}] Step {step} replace - {desc}")
                print(f"  Tgt start: {repr(t_lines[:2])}")
                break
    elif name == "multi_replace_file_content":
        chunks = args.get("ReplacementChunks", [])
        temp_text = text
        failed = False
        for c_idx, ch in enumerate(chunks):
            tgt = normalize(ch.get("TargetContent", ""))
            rep = normalize(ch.get("ReplacementContent", ""))
            if tgt in temp_text:
                temp_text = temp_text.replace(tgt, rep, 1)
            else:
                print(f"[FAILED-CHUNK] {edit_idx}: [{label}] Step {step} chunk {c_idx}")
                print(f"  Tgt: {repr(tgt[:80])}")
                failed = True
                break
        if not failed:
            text = temp_text
            print(f"[OK] {edit_idx}: [{label}] Step {step} multi_replace ({len(chunks)} chunks) - {desc}")
        else:
            break

print(f"Final lines after test: {len(text.splitlines())}")
