"""Offline tests for the agent's deterministic parts — no network, no LLM,
no database. Fixtures are trimmed from real Daraz responses seen on
2026-10-21. Run from ecommerce-price-tracker/:

    .venv\\Scripts\\python.exe -m unittest discover tests
"""

from __future__ import annotations

import unittest
from datetime import date
from decimal import Decimal

from agent.eligibility import best_voucher, check, check_all
from agent.intent import _clean_search_query, _grounded_price, parse_rules, query_numbers, restore_model_numbers
from agent.models import Intent, Listing
from agent.ranking import quantities, rank
from agent.vouchers import parse_card

CAMPAIGN = "https://pages.daraz.com.bd/wow/gcp/route/daraz/bd/upr/router?wh_pid=%2Flazada%2Fchannel%2Fbd%2Fweekly-campaigns%2FbKashChoice"
TODAY = date(2026, 10, 21)

# innerText of the live bKash Choice voucher card, both page languages.
CARD_BN = "সীমিত রিডেম্পশন\nDaraz Voucher\nbKash Choice Exclusive\n৳\n50\nমিন. খরচ করুন ৳ 399\n16/10/2026-22/10/2026\nT&C\nসংগ্রহ"
CARD_EN = "Limited Redemption\nDaraz Voucher\nbKash Choice Exclusive\n৳\n50\nMin. spend ৳ 399\n16/10/2026-22/10/2026\nT&C\nCollect"
CARD_PERCENT = "Daraz Voucher\n10% OFF\nMin. spend ৳ 1,000\nCapped at ৳ 300\n01/11/2026-12/11/2026\nCollect"


def listing(name: str, price, **kw) -> Listing:
    defaults = dict(
        site="daraz", item_id=str(abs(hash(name)) % 10**9), sku_id="", url=f"https://www.daraz.com.bd/products/x-i{abs(hash(name)) % 10**9}.html",
        image="", original_price=None, discount_percent=None, seller="Seller", seller_id="", brand="", rating=4.5,
        reviews=10, sold="", in_stock=True, location="", official_store=False, badges=[], highlights=[], category_ids=[],
    )
    defaults.update(kw)
    return Listing(name=name, price=Decimal(price), **defaults)


class ParseCardTest(unittest.TestCase):
    def test_bangla_card(self):
        v = parse_card(CARD_BN, CAMPAIGN)
        self.assertEqual((v.amount, v.min_spend, v.percent), (Decimal(50), Decimal(399), None))
        self.assertEqual((v.valid_from, v.valid_to), (date(2026, 10, 16), date(2026, 10, 22)))
        self.assertEqual(v.title, "Daraz Voucher")
        self.assertEqual(v.labels, ["Limited redemption", "bKash Choice Exclusive"])

    def test_english_card_matches_bangla(self):
        bn, en = parse_card(CARD_BN, CAMPAIGN), parse_card(CARD_EN, CAMPAIGN)
        self.assertEqual((en.amount, en.min_spend, en.valid_to), (bn.amount, bn.min_spend, bn.valid_to))

    def test_percent_card_with_cap(self):
        v = parse_card(CARD_PERCENT, CAMPAIGN)
        self.assertEqual((v.percent, v.max_discount, v.min_spend, v.amount), (Decimal(10), Decimal(300), Decimal(1000), None))

    def test_bangla_digits(self):
        v = parse_card("Daraz Voucher\n৳ ১০০\nমিন. খরচ করুন ৳ ৯৯৯\n০১/১১/২০২৬-১১/১১/২০২৬", CAMPAIGN)
        self.assertEqual((v.amount, v.min_spend, v.valid_to), (Decimal(100), Decimal(999), date(2026, 11, 11)))

    def test_product_tile_is_not_a_voucher(self):
        self.assertIsNone(parse_card("-68%\n20.2K বিক্রীত\nAluminium Body Cutter With 6 Blades\n৳79\nএখনই কিনুন", CAMPAIGN))


class EligibilityTest(unittest.TestCase):
    def setUp(self):
        self.flat = parse_card(CARD_EN, CAMPAIGN)
        self.percent = parse_card(CARD_PERCENT, CAMPAIGN)

    def test_over_minimum_is_conditional_with_reasons(self):
        c = check(self.flat, listing("Special Miniket Rice 5Kg", 490), TODAY)
        self.assertEqual((c.status, c.saving), ("conditional", Decimal(50)))
        self.assertIn("Pay with bKash", c.conditions)
        self.assertTrue(any("bKashChoice campaign" in x for x in c.conditions))

    def test_under_minimum_reports_the_gap(self):
        c = check(self.flat, listing("Lux Soap 90g", 59), TODAY)
        self.assertEqual(c.status, "not_applicable")
        self.assertIn("৳340 short", c.reasons[0])

    def test_expired_and_not_started(self):
        self.assertEqual(check(self.flat, listing("x", 500), date(2026, 10, 23)).status, "not_applicable")
        self.assertEqual(check(self.percent, listing("x", 5000), TODAY).status, "not_applicable")

    def test_percent_is_capped(self):
        c = check(self.percent, listing("x", 5000), date(2026, 11, 5))
        self.assertEqual(c.saving, Decimal(300))  # 10% of 5000 = 500, capped at 300

    def test_best_voucher_is_single_biggest_not_a_sum(self):
        checks = check_all([self.flat, self.percent], listing("x", 5000), date(2026, 11, 5))
        self.assertEqual(best_voucher(checks).saving, Decimal(300))


class IntentRulesTest(unittest.TestCase):
    def test_budget_shorthand(self):
        i = parse_rules("phone under 25k")
        self.assertEqual((i.mode, i.max_price), ("need", Decimal(25000)))

    def test_bangla_budget(self):
        self.assertEqual(parse_rules("ভালো ফোন ১৫০০০ টাকার মধ্যে").max_price, Decimal(15000))

    def test_model_number_is_not_a_budget(self):
        i = parse_rules("iphone 15")
        self.assertEqual((i.mode, i.search_query, i.max_price), ("product", "iphone 15", None))

    def test_llm_budget_must_appear_in_query(self):
        nums = query_numbers("phone under 25k with good camera")
        self.assertEqual(_grounded_price(25000, nums), Decimal(25000))
        self.assertIsNone(_grounded_price(30000, nums))  # invented by the model

    def test_dropped_model_numbers_restored(self):
        self.assertEqual(restore_model_numbers("Xiaomi Redmi Note 14", "Xiaomi Redmi Note"), " 14")
        self.assertEqual(restore_model_numbers("realme note 60x under 20k", "realme note"), " 60x")
        self.assertEqual(restore_model_numbers("miniket rice 5kg", "miniket rice 5kg"), "")

    def test_price_words_stripped_but_sizes_kept(self):
        self.assertEqual(_clean_search_query("miniket rice 5kg under 1,000 tk"), "miniket rice 5kg")


class RankingTest(unittest.TestCase):
    def product(self, q: str) -> Intent:
        return Intent(raw_query=q, mode="product", search_query=q)

    def test_accessories_and_other_models_dropped(self):
        ranked, _ = rank(
            [
                listing("Samsung Galaxy A36 5G 8/128GB", 43571, official_store=True),
                listing("Samsung Galaxy A56/A36 Anti Yellow Phone Case", 176),
                listing("Samsung Galaxy A56 5G 8/256GB", 52000),
            ],
            self.product("Samsung Galaxy A36"),
        )
        self.assertEqual([l.price for l in ranked], [Decimal(43571)])

    def test_bare_number_binds_to_model(self):
        ranked, _ = rank([listing("iPhone 17 256GB", 127999), listing("Apple iPhone 15 128GB", 99000)], self.product("iphone 15"))
        self.assertEqual([l.price for l in ranked], [Decimal(99000)])

    def test_clones_far_below_official_price_are_skipped(self):
        ranked, skipped = rank(
            [
                listing("Sony WH-1000XM5 Noise Canceling Headphones", 28900, official_store=True),
                *[listing(f"COD 2023 New Sony WH-1000XM5 Headphones {i}", 2581 + i) for i in range(4)],
            ],
            self.product("sony wh-1000xm5"),
        )
        self.assertEqual(([l.price for l in ranked], skipped), ([Decimal(28900)], 4))

    def test_wrong_size_and_partial_matches_dropped(self):
        ranked, _ = rank(
            [
                listing("Special Miniket Rice 5Kg", 490),
                listing("KHAN RICE Premium Miniket Rice - 25 kg", 2000),
                listing("Royal Umbrella Jasmine Rice 5KG", 1538),
            ],
            self.product("miniket rice 5kg"),
        )
        self.assertEqual([l.name for l in ranked], ["Special Miniket Rice 5Kg"])

    def test_need_mode_prefers_fit_near_budget(self):
        intent = Intent(raw_query="", mode="need", search_query="smartphone", max_price=Decimal(25000), must_have=["good camera"])
        ranked, _ = rank(
            [
                listing("Feature Phone with Digital Camera", 9000, highlights=["camera"]),
                listing("realme C100x 6+128GB", 24399, highlights=["50MP AI camera"], reviews=25, rating=5.0),
                listing("Phone 30000", 30000, highlights=["camera"]),
            ],
            intent,
        )
        self.assertEqual(ranked[0].price, Decimal(24399))
        self.assertNotIn(Decimal(30000), [l.price for l in ranked])

    def test_quantity_normalization(self):
        self.assertEqual(quantities("Rice 5 KG"), quantities("rice 5kg"))
        self.assertEqual(quantities("Oil 1 Litre"), {"1l"})


if __name__ == "__main__":
    unittest.main()
