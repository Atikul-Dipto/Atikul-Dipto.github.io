"""Selenium scraper for permitted public job and career pages.

Use only public pages that permit automated access. Keep runs infrequent and
respect each site's terms, robots rules, and rate limits.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

from selenium import webdriver
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


@dataclass
class Job:
    job_title: str
    company: str
    location: str
    salary: str
    skills: str
    experience: str
    industry: str
    source_url: str
    posted_at: str
    scraped_at: str


def text(card, selectors: list[str]) -> str:
    for selector in selectors:
        matches = card.find_elements(By.CSS_SELECTOR, selector)
        for match in matches:
            value = (match.get_attribute("textContent") or "").strip()
            if value:
                return re.sub(r"\s+", " ", value)
    return ""


def make_driver(headless: bool) -> webdriver.Chrome:
    options = Options()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--window-size=1440,1000")
    options.add_argument("--lang=en-US")
    options.add_argument("--disable-gpu")
    return webdriver.Chrome(options=options)


def scrape(args: argparse.Namespace) -> list[Job]:
    driver = make_driver(not args.headed)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        driver.get(args.url)
        WebDriverWait(driver, args.wait).until(
            lambda browser: browser.find_elements(By.CSS_SELECTOR, args.card)
        )
        jobs = []
        cards = driver.find_elements(By.CSS_SELECTOR, args.card)[: args.limit]
        for card in cards:
            title = text(card, args.title)
            if not title:
                continue
            anchors = card.find_elements(By.CSS_SELECTOR, "a[href]")
            source_url = urljoin(args.url, anchors[0].get_attribute("href")) if anchors else args.url
            jobs.append(Job(
                job_title=title,
                company=text(card, args.company),
                location=text(card, args.location),
                salary=text(card, args.salary),
                skills=text(card, args.skills),
                experience=text(card, args.experience),
                industry=args.industry,
                source_url=source_url,
                posted_at=text(card, args.posted),
                scraped_at=now,
            ))
        return jobs
    except WebDriverException as error:
        raise RuntimeError(f"Could not render {args.url}: {error}") from error
    finally:
        driver.quit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape a permitted public job listing with Selenium.")
    parser.add_argument("--url", required=True, help="Public career or job-listing URL")
    parser.add_argument("--company", nargs="+", default=[".company", "[class*='company' i]"], help="Company selectors")
    parser.add_argument("--card", default="article, .job-card, .job-listing, [data-job-id]", help="Job-card selector")
    parser.add_argument("--title", nargs="+", default=["h2", "h3", ".job-title", "[class*='title' i]"], help="Title selectors")
    parser.add_argument("--location", nargs="+", default=[".location", "[class*='location' i]"], help="Location selectors")
    parser.add_argument("--salary", nargs="+", default=[".salary", "[class*='salary' i]", "[class*='pay' i]"], help="Salary selectors")
    parser.add_argument("--skills", nargs="+", default=[".skills", "[class*='skill' i]", ".tags"], help="Skills selectors")
    parser.add_argument("--experience", nargs="+", default=[".experience", "[class*='experience' i]"], help="Experience selectors")
    parser.add_argument("--posted", nargs="+", default=["time", ".posted", "[class*='date' i]"], help="Posted-date selectors")
    parser.add_argument("--industry", default="Unclassified", help="Industry label for this source")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--wait", type=int, default=20)
    parser.add_argument("--headed", action="store_true")
    parser.add_argument("--output", type=Path, default=Path("public/jobs.json"))
    args = parser.parse_args()
    rows = [asdict(job) for job in scrape(args)]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"Saved {len(rows)} jobs to {args.output}")


if __name__ == "__main__":
    main()
