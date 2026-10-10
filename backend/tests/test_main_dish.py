from app.main import main_dish


def lunch(*sections):
    return {"repas": [{"type": "midi", "categories": [{"libelle": n, "plats": [{"code": i, "libelle": t} for i, t in enumerate(ps)]}
                                                       for n, ps in sections]}]}


def test_skips_starters_labels_and_the_vegetarian_alternative():
    # Resto U L'Amazone, 2026-10-06
    menu = lunch(
        ("Entrees", ["Salade de riz au thon", "Tomates"]),
        ("Plat du jour - stand 2", ["Alternative sans viande :", "Pâtes bio fusili coco"]),
        ("Plat du jour - stand 3 , 4 , 5", ["Merlu sauce basilic", "Semoule / pâtes , carottes",
                                            "Ou Alternative sans viande :", "Parmentier courgettes feta"]),
    )
    assert main_dish(menu) == "Merlu sauce basilic"


def test_skips_menu_not_communicated():
    # Resto U L'Amazone, 2026-10-10
    menu = lunch(("Entrees", ["Entrées aux choix"]), ("Plat du jour - stand 2", ["Menu non communiqué"]),
                 ("Plat du jour - stand 3 , 4 , 5", ["Poisson aux amandes"]))
    assert main_dish(menu) == "Poisson aux amandes"


def test_unknown_section_names_fall_back_to_the_second_section_and_no_lunch_is_none():
    assert main_dish(lunch(("Entrées", ["Radis"]), ("Le coin du chef", ["Tajine de poulet"]))) == "Tajine de poulet"
    assert main_dish({"repas": [{"type": "soir", "categories": []}]}) is None
    assert main_dish(None) is None
