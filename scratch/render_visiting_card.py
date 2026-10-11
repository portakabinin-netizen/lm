import os
from PIL import Image, ImageDraw, ImageFont

# Canvas dimensions
WIDTH = 880
HEIGHT = 500

img = Image.new("RGBA", (WIDTH, HEIGHT), (255, 255, 255, 255))
draw = ImageDraw.Draw(img)

# Try loading standard system fonts
def get_font(size, bold=False):
    font_names = [
        "arialbd.ttf" if bold else "arial.ttf",
        "segui_sb.ttf" if bold else "segoeui.ttf",
        "calibrib.ttf" if bold else "calibri.ttf",
        "Arial Bold.ttf" if bold else "Arial.ttf",
    ]
    for name in font_names:
        try:
            return ImageFont.truetype(name, size)
        except:
            continue
    return ImageFont.load_default()

# 1. Base White Background is already drawn (255,255,255)

# 2. Draw Red Curve Accent & Black Body using polygon approximations of bezier curves
import math

# Red curve points
red_points = [(0, 0)]
# top edge to x=424
red_points.append((424, 0))
# curve bulging to right: center around y=250, x=564
for t in range(0, 101):
    ratio = t / 100.0
    # Quadratic / cubic bezier formula: P0=(424,0), P1=(564, 125), P2=(564, 375), P3=(424, 500)
    # Cubic: (1-t)^3 P0 + 3(1-t)^2 t P1 + 3(1-t) t^2 P2 + t^3 P3
    x = (1-ratio)**3 * 424 + 3*(1-ratio)**2 * ratio * 564 + 3*(1-ratio) * ratio**2 * 564 + ratio**3 * 424
    y = ratio * HEIGHT
    red_points.append((x, y))
red_points.append((0, HEIGHT))
draw.polygon(red_points, fill=(220, 38, 38, 255)) # Red #dc2626

# Black body points
black_points = [(0, 0)]
black_points.append((392, 0))
for t in range(0, 101):
    ratio = t / 100.0
    x = (1-ratio)**3 * 392 + 3*(1-ratio)**2 * ratio * 532 + 3*(1-ratio) * ratio**2 * 532 + ratio**3 * 392
    y = ratio * HEIGHT
    black_points.append((x, y))
black_points.append((0, HEIGHT))
draw.polygon(black_points, fill=(10, 10, 10, 255)) # Black #0a0a0a

# 3. Left Section Text & Badges
font_name = get_font(44, bold=True)
font_role = get_font(28, bold=False)
font_contact_bold = get_font(24, bold=True)
font_contact = get_font(22, bold=False)
font_addr = get_font(20, bold=False)

# User Name & Role
draw.text((45, 45), "Suresh Chauhan", font=font_name, fill=(255, 255, 255, 255))
draw.text((45, 100), "Partner", font=font_role, fill=(203, 213, 225, 255))

# Helper to draw red circular icon badge with white symbol
def draw_badge(center_x, center_y, radius, icon_type):
    draw.ellipse([center_x - radius, center_y - radius, center_x + radius, center_y + radius], fill=(220, 38, 38, 255))
    
    # Simple clean geometric icon inside
    if icon_type == "phone":
        # Draw phone handset
        draw.arc([center_x - 10, center_y - 10, center_x + 10, center_y + 10], 120, 240, fill=(255, 255, 255, 255), width=4)
        draw.ellipse([center_x - 10, center_y - 8, center_x - 2, center_y], fill=(255, 255, 255, 255))
        draw.ellipse([center_x - 10, center_y + 2, center_x - 2, center_y + 10], fill=(255, 255, 255, 255))
    elif icon_type == "send":
        # Draw paper airplane triangle
        p1 = (center_x + 10, center_y)
        p2 = (center_x - 8, center_y - 9)
        p3 = (center_x - 3, center_y)
        p4 = (center_x - 8, center_y + 9)
        draw.polygon([p1, p2, p3, p4], fill=(255, 255, 255, 255))
    elif icon_type == "home":
        # Draw roof triangle & body
        p1 = (center_x, center_y - 10)
        p2 = (center_x - 10, center_y - 1)
        p3 = (center_x + 10, center_y - 1)
        draw.polygon([p1, p2, p3], fill=(255, 255, 255, 255))
        draw.rectangle([center_x - 7, center_y - 1, center_x + 7, center_y + 9], fill=(255, 255, 255, 255))
        draw.rectangle([center_x - 2, center_y + 2, center_x + 2, center_y + 9], fill=(220, 38, 38, 255))

# Row 1: Phone
draw_badge(72, 195, 26, "phone")
draw.text((120, 180), "+91 8368333343", font=font_contact_bold, fill=(255, 255, 255, 255))

# Row 2: Email & Web
draw_badge(72, 285, 26, "send")
draw.text((120, 260), "info@portakabin.in", font=font_contact_bold, fill=(255, 255, 255, 255))
draw.text((120, 292), "www.portakabin.in", font=font_contact_bold, fill=(255, 255, 255, 255))

# Row 3: Address
draw_badge(72, 395, 26, "home")
draw.text((120, 365), "141-B, GF, Opp LSR", font=font_addr, fill=(255, 255, 255, 255))
draw.text((120, 392), "College, Zamrudpur", font=font_addr, fill=(255, 255, 255, 255))
draw.text((120, 419), "New Delhi-110048", font=font_addr, fill=(255, 255, 255, 255))

# 4. Right Section: Corporate Identity
corp_center_x = 700
logo_center_y = 170

# Draw circular emblem logo
logo_radius = 55
draw.ellipse([corp_center_x - logo_radius, logo_center_y - logo_radius, corp_center_x + logo_radius, logo_center_y + logo_radius], outline=(30, 58, 138, 255), width=9)
draw.line([corp_center_x - logo_radius + 5, logo_center_y, corp_center_x + logo_radius - 5, logo_center_y], fill=(30, 58, 138, 255), width=9)
draw.line([corp_center_x, logo_center_y - logo_radius + 5, corp_center_x, logo_center_y + logo_radius - 5], fill=(30, 58, 138, 255), width=9)

# Corporate Name
font_corp_name = get_font(38, bold=True)
font_corp_tag = get_font(24, bold=True)

corp_text = "portakabin.in"
tag_text = "U/o Hiresh iSearch"

# Measure text to center
bbox_corp = font_corp_name.getbbox(corp_text)
w_corp = bbox_corp[2] - bbox_corp[0]
draw.text((corp_center_x - w_corp // 2, 270), corp_text, font=font_corp_name, fill=(30, 58, 138, 255))

bbox_tag = font_corp_tag.getbbox(tag_text)
w_tag = bbox_tag[2] - bbox_tag[0]
draw.text((corp_center_x - w_tag // 2, 330), tag_text, font=font_corp_tag, fill=(30, 41, 59, 255))

# Apply rounded corners to whole card
mask = Image.new("L", (WIDTH, HEIGHT), 0)
mask_draw = ImageDraw.Draw(mask)
mask_draw.rounded_rectangle([0, 0, WIDTH, HEIGHT], radius=32, fill=255)

output = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
output.paste(img, (0, 0), mask=mask)

out_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain\473a5d1a-9c13-4c4a-b385-2d7e60702b37"
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, "visiting_card_preview.png")
output.save(out_path, "PNG")
print("SUCCESS:", out_path)
