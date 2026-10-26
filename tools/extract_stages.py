"""Cuts every new stage sheet into runtime frames.

  assets/tasks.png, assets/stage-1..4/*.png  ->  assets/runtime/stage/<key>_<i>.png
  + assets/runtime/stage/manifest.json  {key: {n, w, h}}

The client loads frames by key from the manifest, so redrawn sheets can be dropped in and
re-cut (npm run assets) without touching game code. Missing keys fall back to placeholders.
Each SPEC entry: key, sheet, box (x0,y0,x1,y1), frames, mode, scale  [, anchor, cuts, min_area]
"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sheetcut import cut_region, pack

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'assets')
OUT = os.path.join(A, 'runtime', 'stage')

S = []
ERASE: dict = {}   # sheet -> label rectangles to blank before cutting
def spec(key, sheet, box, n, mode, scale, **kw):
    S.append(dict(key=key, sheet=sheet, box=box, n=n, mode=mode, scale=scale, **kw))

# ---------------------------------------------------------------- task animations (tasks.png)
T = 'tasks.png'
TS = 0.62   # character frames ~ the same height as the in-game hero strips
spec('task_coding_prep', T, (25, 114, 868, 250), 6, 'navy', TS)
spec('task_coding_loop', T, (25, 314, 868, 442), 8, 'navy', TS)
spec('task_coding_done', T, (25, 508, 868, 634), 6, 'navy', TS)
spec('task_gaming_prep', T, (912, 105, 1762, 262), 6, 'red', TS)
spec('task_gaming_loop', T, (912, 300, 1762, 442), 8, 'red', TS)
spec('task_gaming_done', T, (912, 490, 1762, 634), 6, 'red', TS)
spec('task_screen_code', T, (472, 695, 628, 838), 1, 'navy', 0.4, anchor='center')
spec('task_screen_game', T, (1328, 695, 1525, 838), 1, 'red', 0.4, anchor='center')

# ---------------------------------------------------------------- stage 1: slops
E1 = 'stage-1/enemies.png'
ES = 0.36
for key, (y0, y1), cols in [
    ('slop_blob', (160, 322), dict(idle=(11, 372, 4), move=(378, 728, 4), attack=(728, 1030, 3), frozen=(1111, 1385, 3), defeat=(1394, 1667, 2))),
    ('slop_noodle', (447, 622), dict(idle=(11, 372, 4), move=(378, 733, 4), attack=(733, 1000, 2), frozen=(1128, 1400, 3), defeat=(1398, 1667, 2))),
    ('slop_burger', (735, 910), dict(idle=(11, 372, 3), move=(380, 733, 3), attack=(744, 990, 2), frozen=(1111, 1390, 3), defeat=(1398, 1667, 2))),
]:
    for anim, (x0, x1, n) in cols.items():
        spec(f'{key}_{anim}', E1, (x0, y0, x1, y1), n, 'alpha', ES)

B1 = 'stage-1/final-boss.png'
ERASE[B1] = [(10, 50, 230, 98), (15, 226, 320, 268), (15, 398, 326, 437), (15, 585, 342, 624), (15, 759, 336, 800), (762, 765, 1022, 804)]
BS1 = 0.56
spec('hrana_idle', B1, (185, 58, 1470, 230), 4, 'alpha', BS1, cuts=[185, 514, 836, 1153, 1470])
spec('hrana_move', B1, (52, 248, 1636, 402), 4, 'alpha', BS1, cuts=[52, 439, 828, 1211, 1636])
spec('hrana_attack', B1, (20, 420, 1652, 580), 4, 'alpha', BS1, cuts=[20, 389, 833, 1289, 1652])
spec('hrana_summon', B1, (25, 587, 1658, 769), 4, 'alpha', BS1, cuts=[25, 411, 833, 1233, 1658])
spec('hrana_frozen', B1, (20, 776, 758, 936), 3, 'alpha', BS1, cuts=[20, 267, 511, 758])
spec('hrana_defeat', B1, (756, 804, 1670, 936), 4, 'alpha', BS1, cuts=[756, 1011, 1250, 1489, 1670])

FX1 = 'stage-1/boss-effects-attacks.png'
ERASE[FX1] = [(30, 78, 334, 119), (812, 85, 1066, 127), (22, 224, 375, 267), (1006, 236, 1303, 279), (26, 413, 361, 457),
              (24, 613, 208, 657), (733, 616, 1100, 659), (26, 793, 265, 834), (411, 795, 753, 836), (913, 798, 1163, 840),
              (26, 938, 380, 979), (868, 952, 1425, 1065)]
spec('fx_grease', FX1, (28, 140, 805, 205), 7, 'alpha', 0.5, anchor='center', keep_small=True)
spec('fx_sauce_splat', FX1, (832, 115, 1432, 228), 4, 'alpha', 0.5, anchor='center')
spec('fx_noodle_whip', FX1, (22, 262, 995, 448), 1, 'alpha', 0.5, anchor='center')
spec('proj_burger', FX1, (1022, 292, 1105, 362), 1, 'alpha', 0.5, anchor='center')
spec('proj_tomato', FX1, (1022, 368, 1100, 424), 1, 'alpha', 0.5, anchor='center')
spec('proj_bread', FX1, (1022, 432, 1100, 502), 1, 'alpha', 0.5, anchor='center')
spec('proj_greens', FX1, (1022, 512, 1110, 604), 1, 'alpha', 0.5, anchor='center')
spec('fx_puddle_brown', FX1, (32, 452, 945, 532), 5, 'alpha', 0.5, anchor='center')
spec('fx_puddle_green', FX1, (32, 532, 945, 618), 5, 'alpha', 0.5, anchor='center')
spec('fx_slime_burst', FX1, (28, 632, 725, 782), 5, 'alpha', 0.5)
spec('fx_summon', FX1, (732, 645, 1435, 782), 5, 'alpha', 0.5)
spec('fx_hit', FX1, (42, 842, 365, 922), 4, 'alpha', 0.5, anchor='center', keep_small=True)
spec('fx_shards', FX1, (442, 842, 855, 948), 1, 'alpha', 0.5, anchor='center', keep_small=True)
spec('fx_stink', FX1, (902, 805, 1435, 952), 4, 'alpha', 0.5)
spec('fx_warn', FX1, (32, 975, 818, 1072), 6, 'alpha', 0.5, anchor='center')

P1 = 'stage-1/hazards-pickups.png'
ERASE[P1] = [(18, 86, 282, 134), (388, 86, 604, 134), (736, 86, 1050, 134), (1108, 86, 1414, 134),
             (18, 298, 292, 348), (386, 298, 680, 348), (774, 298, 1072, 348), (1120, 298, 1370, 348),
             (16, 521, 370, 570), (486, 521, 788, 570), (968, 521, 1352, 570),
             (16, 703, 320, 752), (476, 703, 816, 752), (968, 703, 1352, 752), (18, 888, 414, 937), (710, 888, 937, 937)]
for key, box, n in [
    ('item_pizza', (18, 142, 372, 262), 4), ('item_burger', (392, 142, 742, 262), 4),
    ('item_energy', (768, 135, 1092, 262), 4), ('item_protein', (1108, 135, 1440, 268), 4),
    ('item_creatine', (12, 362, 352, 492), 4), ('item_mealprep', (362, 362, 772, 492), 4),
    ('item_noodles', (782, 352, 1098, 492), 3), ('item_coffee', (1108, 360, 1444, 488), 3),
]:
    spec(key, P1, box, n, 'alpha', 0.5, anchor='center')
spec('fx_coffee_spill', P1, (45, 572, 472, 672), 3, 'alpha', 0.5, anchor='center')
spec('fx_grease_puddle', P1, (495, 585, 952, 672), 3, 'alpha', 0.5, anchor='center')
spec('fx_sauce_puddle', P1, (975, 585, 1432, 672), 3, 'alpha', 0.5, anchor='center')
spec('proj_sauce', P1, (15, 748, 475, 878), 5, 'alpha', 0.5, anchor='center')
spec('proj_noodle', P1, (492, 748, 958, 878), 5, 'alpha', 0.5, anchor='center')
spec('proj_chunk', P1, (985, 758, 1435, 878), 4, 'alpha', 0.5, anchor='center')
spec('fx_sparkle', P1, (25, 932, 675, 1072), 5, 'alpha', 0.5, anchor='center', keep_small=True)
spec('s1_exit', P1, (738, 925, 1440, 1072), 4, 'alpha', 0.5)

# stage-1 tiles / furniture (single crops)
K1 = 'stage-1/assets1.png'
for key, box in [
    ('s1_floor_0', (22, 58, 95, 131)), ('s1_floor_1', (102, 58, 174, 131)), ('s1_floor_2', (22, 138, 95, 211)), ('s1_floor_3', (102, 138, 174, 211)),
    ('s1_wall_0', (355, 55, 440, 213)), ('s1_wall_1', (625, 55, 702, 213)), ('s1_wall_2', (712, 55, 797, 213)), ('s1_wall_3', (803, 55, 1002, 213)),
    ('s1_counter_0', (16, 314, 250, 454)), ('s1_counter_1', (246, 280, 458, 454)), ('s1_counter_2', (454, 310, 620, 454)), ('s1_counter_3', (616, 278, 834, 454)),
    ('s1_stove', (848, 274, 1097, 457)), ('s1_fridge', (1126, 276, 1264, 470)), ('s1_fridge_open', (1266, 276, 1434, 470)),
    ('s1_prep_0', (16, 524, 250, 676)), ('s1_prep_1', (250, 524, 460, 676)), ('s1_sink', (462, 516, 755, 676)),
    ('s1_shelf_wall', (778, 516, 1078, 684)), ('s1_shelf', (1118, 512, 1414, 672)),
    ('s1_table', (22, 730, 378, 906)), ('s1_chair', (384, 756, 467, 902)), ('s1_stool', (478, 782, 562, 902)), ('s1_trays', (572, 754, 832, 882)),
    ('s1_trash', (838, 752, 1003, 897)), ('s1_wetsign', (1038, 752, 1162, 892)), ('s1_door', (1216, 710, 1418, 902)),
    ('s1_clock', (18, 962, 99, 1043)), ('s1_menu', (104, 958, 214, 1070)), ('s1_board', (218, 958, 322, 1070)), ('s1_plant', (322, 942, 398, 1070)),
    ('s1_ice', (848, 960, 937, 1050)), ('s1_crates', (1148, 952, 1297, 1070)), ('s1_barrier', (1298, 972, 1422, 1064)),
]:
    spec(key, K1, box, 1, 'alpha', 1.0, anchor='center')

# ---------------------------------------------------------------- stage 2: Ekonomska skola
E2 = 'stage-2/enemies.png'
for key, (y0, y1), cols in [
    ('prefect', (222, 378), dict(idle=(2, 286, 4), move=(296, 586, 4), attack=(588, 808, 3), frozen=(904, 1152, 3), defeat=(1160, 1444, 3))),
    ('runner', (542, 702), dict(idle=(2, 286, 4), move=(296, 590, 4), attack=(594, 892, 2), frozen=(904, 1152, 3), defeat=(1160, 1446, 2))),
    ('monitor', (862, 1028), dict(idle=(2, 286, 4), move=(296, 588, 4), attack=(588, 912, 4), frozen=(908, 1156, 3), defeat=(1160, 1442, 2))),
]:
    for anim, (x0, x1, n) in cols.items():
        spec(f'{key}_{anim}', E2, (x0, y0, x1, y1), n, 'flat', 0.4)

B2 = 'stage-2/final-boss.png'
BS2 = 0.46
spec('sonja_idle', B2, (18, 302, 445, 528), 4, 'flat', BS2)
spec('sonja_walk', B2, (452, 302, 912, 528), 4, 'flat', BS2)
spec('sonja_flash', B2, (922, 302, 1405, 532), 3, 'flat', BS2, cuts=[922, 1055, 1235, 1405])
spec('sonja_storm', B2, (12, 572, 728, 802), 4, 'flat', BS2, cuts=[12, 142, 268, 540, 728])
spec('sonja_quiz', B2, (742, 572, 1002, 802), 2, 'flat', BS2, cuts=[742, 862, 1002])
spec('fx_econ', B2, (1000, 572, 1442, 802), 2, 'flat', BS2, cuts=[1000, 1192, 1442], anchor='center')
spec('sonja_summon', B2, (12, 842, 152, 1058), 1, 'flat', BS2)
spec('elite_idle', B2, (396, 842, 504, 1058), 1, 'flat', 0.4)
spec('sonja_hurt', B2, (662, 842, 1008, 1058), 3, 'flat', BS2, cuts=[662, 760, 875, 1008])
spec('sonja_defeat', B2, (1008, 842, 1444, 1058), 3, 'flat', BS2, cuts=[1008, 1120, 1260, 1444])

FX2 = 'stage-2/boss-attacks-hazards.png'
spec('fx_flashball', FX2, (748, 160, 1425, 218), 3, 'glow', 0.5, anchor='center', cuts=[748, 830, 900, 975])
spec('fx_beam', FX2, (975, 150, 1425, 222), 1, 'glow', 0.5, anchor='center')
spec('fx_tornado', FX2, (740, 272, 1430, 398), 7, 'flat', 0.5, anchor='center')
spec('proj_test', FX2, (22, 448, 780, 540), 9, 'flat', 0.45, anchor='center')
spec('fx_fmark', FX2, (790, 438, 1440, 552), 5, 'flat', 0.45, anchor='center')
spec('fx_spawn', FX2, (14, 788, 340, 908), 3, 'glow', 0.5)
spec('fx_bossspark', FX2, (1030, 795, 1430, 900), 4, 'flat', 0.4, anchor='center', keep_small=True)
spec('s2_papers', FX2, (14, 965, 330, 1070), 1, 'flat', 0.5, anchor='center')
spec('s2_chair', FX2, (610, 940, 840, 1070), 1, 'flat', 0.5, anchor='center')

# ---------------------------------------------------------------- stage 3: DRPD
E3 = 'stage-3/enemies-npc.png'
ES3 = 0.42
for key, (y0, y1), cols in [
    ('staff', (55, 205), dict(idle=(20, 270, 3), move=(270, 552, 3), attack=(552, 880, 3), frozen=(895, 1180, 3), defeat=(1195, 1440, 2))),
    ('super', (310, 495), dict(idle=(20, 290, 3), move=(290, 560, 3), attack=(560, 890, 3), frozen=(895, 1205, 3), defeat=(1210, 1440, 2))),
    ('kid1', (595, 745), dict(idle=(25, 305, 3), move=(305, 660, 3), help=(680, 1035, 3), happy=(1070, 1430, 3))),
    ('kid2', (825, 1000), dict(idle=(15, 335, 3), move=(335, 720, 3), help=(730, 1090, 3), happy=(1095, 1435, 3))),
]:
    for anim, (x0, x1, n) in cols.items():
        spec(f'{key}_{anim}', E3, (x0, y0, x1, y1), n, 'flat', ES3)

C3 = 'stage-3/collectables.png'
for key, box in [
    ('book_math', (1055, 845, 1145, 985)), ('book_history', (1150, 845, 1245, 985)), ('book_chemistry', (1250, 845, 1345, 985)),
    ('book_slovenian', (1345, 845, 1435, 985)), ('icon_patience', (1105, 85, 1225, 265)), ('icon_helper', (565, 60, 715, 255)),
    ('item_juice', (760, 95, 875, 255)), ('item_coffee3', (925, 100, 1065, 245)), ('icon_heart', (1265, 105, 1410, 245)),
    ('fx_taskring', (25, 575, 215, 755)), ('fx_kidalert', (240, 550, 415, 740)), ('fx_levelup', (440, 555, 620, 740)),
    ('fx_patience', (640, 580, 820, 735)), ('fx_camera', (840, 555, 1020, 730)), ('fx_stars', (1035, 600, 1220, 715)),
    ('fx_heal', (1250, 555, 1420, 740)), ('s3_toys', (20, 330, 300, 485)), ('s3_car', (350, 375, 560, 470)),
    ('s3_papers', (595, 340, 840, 490)), ('s3_wetsign', (855, 305, 1080, 505)), ('s3_books', (1100, 325, 1425, 490)),
    ('s3_flag', (40, 820, 190, 1020)), ('s3_exit', (205, 820, 480, 1035)), ('s3_board', (480, 820, 725, 1000)),
    ('s3_toybox', (740, 885, 910, 1025)), ('icon_drpd', (25, 85, 180, 245)),
]:
    spec(key, C3, box, 1, 'flat', 0.5, anchor='center')

F3 = 'stage-3/branka-fire.png'
spec('fire_ball', F3, (15, 60, 730, 150), 7, 'glow', 0.5, anchor='center')
spec('fire_impact', F3, (770, 40, 1440, 155), 5, 'glow', 0.5, anchor='center')
spec('fire_mark', F3, (690, 225, 1440, 325), 5, 'glow', 0.5, anchor='center')
spec('fire_rain', F3, (15, 385, 660, 555), 5, 'glow', 0.5)
spec('fire_explosion', F3, (720, 395, 1440, 555), 5, 'glow', 0.5)
spec('fx_revive', F3, (775, 635, 1030, 785), 2, 'glow', 0.5)
spec('fx_patience_aura', F3, (1055, 625, 1425, 790), 3, 'glow', 0.5)

# ---------------------------------------------------------------- stage 4: ZIVOT.EXE
E4 = 'stage-4/enemies.png'
ES4 = 0.36
for key, (y0, y1), cols in [
    ('taxman', (50, 225), dict(idle=(22, 172, 1), move=(178, 312, 1), attack=(318, 565, 1), defeat=(568, 722, 1))),
    ('bureau', (50, 225), dict(idle=(752, 882, 1), move=(896, 1045, 1), attack=(1045, 1312, 1), defeat=(1318, 1444, 1))),
    ('banker', (288, 488), dict(idle=(12, 168, 1), move=(168, 335, 1), attack=(338, 522, 1), defeat=(525, 722, 1))),
    ('landlord', (290, 488), dict(idle=(735, 900, 1), move=(900, 1065, 1), attack=(1068, 1300, 1), defeat=(1300, 1444, 1))),
    ('recruiter', (552, 756), dict(idle=(18, 178, 1), move=(175, 322, 1), attack=(322, 522, 1), defeat=(522, 722, 1))),
    ('insurance', (558, 756), dict(idle=(742, 900, 1), move=(900, 1060, 1), attack=(1058, 1290, 1), defeat=(1290, 1444, 1))),
    ('official', (822, 1045), dict(idle=(36, 238, 1), move=(262, 472, 1), attack=(512, 860, 1), defeat=(872, 1440, 1))),
]:
    for anim, (x0, x1, n) in cols.items():
        spec(f'{key}_{anim}', E4, (x0, y0, x1, y1), n, 'flat', ES4)

B4 = 'stage-4/final-boss.png'
BS4 = 0.36
for anim, box in dict(idle=(12, 105, 478, 470), taunt=(488, 105, 962, 470), cast=(962, 70, 1442, 470), throw=(0, 490, 362, 948),
                      enraged=(368, 490, 822, 948), hurt=(825, 570, 1080, 948), defeat=(1082, 565, 1444, 948)).items():
    spec(f'collector_{anim}', B4, box, 1, 'flat', BS4)

F4 = 'stage-4/final-boss-attacks.png'
spec('doc_tax', F4, (15, 165, 168, 292), 1, 'flat', 0.4, anchor='center')
spec('doc_rent', F4, (168, 165, 325, 292), 1, 'flat', 0.4, anchor='center')
spec('doc_fee', F4, (325, 165, 482, 292), 1, 'flat', 0.4, anchor='center')
spec('doc_pastdue', F4, (482, 165, 645, 292), 1, 'flat', 0.4, anchor='center')
spec('fx_money', F4, (950, 160, 1440, 312), 3, 'flat', 0.4, anchor='center')
spec('fx_coins', F4, (12, 340, 562, 452), 1, 'flat', 0.4, anchor='center')
spec('proj_debt', F4, (572, 345, 1082, 452), 4, 'flat', 0.4, anchor='center')
spec('proj_key', F4, (1092, 335, 1442, 452), 4, 'flat', 0.4, anchor='center')
spec('fx_briefcase', F4, (12, 495, 790, 690), 4, 'flat', 0.4)
spec('fx_cashstorm', F4, (805, 490, 1442, 705), 4, 'flat', 0.4)
spec('fx_lock', F4, (12, 742, 682, 892), 3, 'flat', 0.4, anchor='center')
spec('fx_icebreak', F4, (690, 745, 1442, 892), 4, 'flat', 0.4, anchor='center')
spec('fx_boom', F4, (12, 985, 505, 1078), 3, 'flat', 0.4, anchor='center')
spec('fx_hazard', F4, (968, 985, 1442, 1078), 4, 'flat', 0.4, anchor='center')

P4 = 'stage-4/pickups.png'
for key, box in [('item_euro', (830, 85, 975, 235)), ('item_laptop', (235, 255, 505, 462)), ('item_coffeemachine', (665, 260, 845, 452)),
                 ('icon_lock', (555, 675, 712, 832)), ('s4_papers', (15, 40, 230, 240)), ('s4_briefcase', (1215, 75, 1425, 245)),
                 ('s4_stamp', (30, 275, 195, 440)), ('s4_trap', (965, 665, 1185, 830)), ('s4_turnstile', (255, 845, 430, 1045))]:
    spec(key, P4, box, 1, 'flat', 0.5, anchor='center')

# ---------------------------------------------------------------- per-stage tile skins (single crops, scaled to 48px in game)
SK = [
  # stage 2: ONE clean floor tile (inside the grout lines) and ONE plain corridor wall, used everywhere;
  # the three ready-made bookshelves from the sheet
  ('stage-2/assets.png', [('s2_floor_0', (23, 45, 68, 90)), ('s2_wall_0', (668, 42, 756, 212)),
    ('s2_desk', (20, 275, 128, 378)), ('s2_teacher', (705, 265, 962, 400)),
    ('s2_shelf', (298, 446, 396, 620)), ('s2_shelf2', (400, 446, 486, 620)), ('s2_shelf3', (490, 446, 600, 620)), ('s2_lockers', (20, 440, 275, 615)), ('s2_bench', (1245, 480, 1425, 590)),
    ('s2_plant', (350, 690, 425, 830)), ('s2_sink', (880, 450, 1065, 610)), ('s2_board', (995, 270, 1235, 410))]),
  ('stage-3/assets.png', [('s3_floor_0', (18, 35, 88, 122)), ('s3_floor_1', (95, 35, 165, 122)), ('s3_floor_2', (325, 35, 415, 122)),
    ('s3_wall_0', (18, 165, 90, 312)), ('s3_wall_1', (245, 165, 315, 312)), ('s3_kiddesk', (15, 568, 118, 652)), ('s3_kiddesk2', (185, 568, 290, 652)),
    ('s3_helper', (375, 550, 590, 655)), ('s3_bookshelf', (605, 550, 700, 680)), ('s3_toyshelf', (870, 550, 965, 680)),
    ('s3_lockers', (1110, 555, 1245, 680)), ('s3_plant', (1125, 375, 1195, 495)), ('st_math', (15, 915, 315, 1065)),
    ('st_history', (335, 915, 650, 1065)), ('st_chemistry', (672, 915, 1022, 1065)), ('st_slovenian', (1045, 915, 1435, 1065))]),
  ('stage-4/assets.png', [('s4_floor_0', (20, 190, 95, 262)), ('s4_floor_1', (95, 190, 168, 262)), ('s4_floor_2', (168, 190, 240, 262)),
    ('s4_floor_3', (240, 260, 312, 330)), ('s4_wall_0', (342, 190, 440, 320)), ('s4_wall_1', (528, 190, 652, 320)),
    ('s4_desk', (20, 450, 230, 580)), ('s4_desk2', (262, 450, 372, 580)), ('s4_cabinet', (465, 375, 540, 580)), ('s4_bookcase', (615, 370, 702, 580)),
    ('s4_atm', (815, 380, 908, 578)), ('s4_chairs', (1058, 470, 1258, 580)), ('s4_plant', (1358, 445, 1435, 578)),
    ('s4_barrier', (1058, 375, 1252, 455)), ('s4_bench', (1075, 640, 1245, 748)), ('s4_trash', (705, 805, 760, 895))]),
]
for sheet, items in SK:
    for key, box in items:
        spec(key, sheet, box, 1, 'flat' if 'floor' not in key and 'wall' not in key else 'none', 1.0, anchor='center')

if __name__ == '__main__':
    only = sys.argv[1:]
    os.makedirs(OUT, exist_ok=True)
    man_path = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}
    sheets = {}
    for s in S:
        if only and not any(s['key'].startswith(o) for o in only):
            continue
        if s['sheet'] not in sheets:
            arr = np.array(Image.open(os.path.join(A, s['sheet'])).convert('RGBA'))
            for (ex0, ey0, ex1, ey1) in ERASE.get(s['sheet'], []):
                arr[ey0:ey1, ex0:ex1] = 0          # label tabs drawn over the art
            sheets[s['sheet']] = arr
        frames = cut_region(sheets[s['sheet']], s['box'], s['n'], s['mode'], s.get('min_area', 120), s.get('keep_small', False), s.get('cuts'))
        if len(frames) != s['n']:
            print(f"WARN {s['key']}: got {len(frames)} frames, expected {s['n']}")
        cells = pack(frames, s['scale'], s.get('anchor', 'feet'))
        for i, c in enumerate(cells):
            # 256-colour palette PNG: visually identical for this art, ~3x smaller download
            c.convert('RGBA').quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(os.path.join(OUT, f"{s['key']}_{i}.png"), optimize=True)
        manifest[s['key']] = {'n': len(cells), 'w': cells[0].width, 'h': cells[0].height}
    # dimmed stage backdrops for the frame around the level
    for i in range(1, 5):
        src = os.path.join(A, f'stage-{i}', 'background.png')
        if os.path.exists(src) and (not only or any('bg' in o for o in only)):
            im = Image.open(src).convert('RGB')
            sc = max(1280 / im.width, 720 / im.height)
            im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
            x, y = (im.width - 1280) // 2, (im.height - 720) // 2
            # backdrops are drawn dimmed behind the board: JPEG keeps the download small
            im.crop((x, y, x + 1280, y + 720)).convert('RGB').save(os.path.join(OUT, f'bg_s{i}_0.jpg'), quality=82)
            manifest[f'bg_s{i}'] = {'n': 1, 'w': 1280, 'h': 720, 'ext': 'jpg'}
    json.dump(manifest, open(man_path, 'w'), indent=0, sort_keys=True)
    print('stage frames:', len(manifest), 'keys')
