import struct
import sys

sys.stdout.reconfigure(encoding="utf-8")

axml_path = r"C:\hipk\scratch\apk_extracted\AndroidManifest.xml"
with open(axml_path, "rb") as f:
    data = f.read()

# Parse String Pool in AXML
# Chunk header: type (2 bytes), header_size (2 bytes), chunk_size (4 bytes)
# String pool type is 0x0001 (CHUNK_STRING_POOL = 0x001c0001)
magic, size = struct.unpack_from("<II", data, 0)
print(f"AXML Header magic: {hex(magic)}, file size: {size}")

chunk_type, chunk_hdr_sz, chunk_sz = struct.unpack_from("<HHI", data, 8)
print(f"Chunk type: {hex(chunk_type)}, header size: {chunk_hdr_sz}, chunk size: {chunk_sz}")

if chunk_type == 0x0001:
    string_count, style_count, flags, string_pool_offset, style_pool_offset = struct.unpack_from("<IIIII", data, 16)
    print(f"Strings in pool: {string_count}")
    is_utf8 = bool(flags & (1 << 8))
    
    offsets = [struct.unpack_from("<I", data, 36 + i * 4)[0] for i in range(string_count)]
    strings_start = 8 + string_pool_offset
    
    strings = []
    for off in offsets:
        str_pos = strings_start + off
        if is_utf8:
            # UTF-8: length prefix (1 or 2 bytes for char count, 1 or 2 bytes for byte count)
            b = data[str_pos]
            if b & 0x80:
                str_pos += 2
            else:
                str_pos += 1
            b = data[str_pos]
            if b & 0x80:
                length = ((b & 0x7F) << 8) | data[str_pos + 1]
                str_pos += 2
            else:
                length = b
                str_pos += 1
            s = data[str_pos : str_pos + length].decode("utf-8", errors="ignore")
        else:
            # UTF-16
            length = struct.unpack_from("<H", data, str_pos)[0]
            str_pos += 2
            s = data[str_pos : str_pos + length * 2].decode("utf-16le", errors="ignore")
        strings.append(s)
    
    print("\n--- Package, Permissions, Services, Receivers in APK Manifest ---")
    permissions = [s for s in strings if "permission" in s.lower()]
    services = [s for s in strings if "service" in s.lower() or "receiver" in s.lower() or "activity" in s.lower()]
    package_names = [s for s in strings if s.startswith("com.")]
    
    print(f"Package names: {package_names[:10]}")
    print(f"\nPermissions ({len(permissions)}):")
    for p in sorted(set(permissions)):
        print(f"  - {p}")
        
    print(f"\nComponents / Services / Receivers ({len(services)}):")
    for s in sorted(set(services)):
        print(f"  - {s}")
