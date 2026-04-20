#!/usr/bin/env python3
"""
Google Patents scraper for TechCatcher.
Uses Scrapling with StealthyFetcher for anti-bot bypass.
Outputs JSON to stdout for Node.js consumption.
"""
import sys
import json
import re
from datetime import datetime
from urllib.parse import quote_plus

try:
    from scrapling import StealthyFetcher
except ImportError:
    print(json.dumps({'error': 'Scrapling not installed. pip install scrapling'}))
    sys.exit(1)


def parse_search_results(body, max_results=10):
    """Parse patent data from Google Patents HTML using regex on web component structure."""
    patents = []

    # Split by <search-result-item> elements
    # Each element starts with <search-result-item and we find its content
    pattern = r'<search-result-item[^>]*>(.*?)(?=<search-result-item|</search-results>)'
    items = re.findall(pattern, body, re.DOTALL)
    # Also include the last item if it ends at end of body
    if not items:
        # Fallback: split greedily
        items = re.split(r'<search-result-item[^>]*>', body)[1:]  # skip before first

    for i, item in enumerate(items[:max_results]):
        patent = {}

        # Patent ID from data-result attribute
        id_match = re.search(r'data-result="patent/([^"]+)"', item)
        if id_match:
            full_id = id_match.group(1)  # e.g., "US12466772B2/en"
            patent_id = full_id.split('/')[0]
            patent['docId'] = patent_id
            patent['ref'] = patent_id
            patent['country'] = patent_id[:2] if len(patent_id) >= 2 else ''
        else:
            # Fallback: extract patent ID from text
            pid_match = re.search(r'([A-Z]{2}\d{7,12}[A-Z]?\d?)', item)
            if pid_match:
                patent['docId'] = pid_match.group(1)
                patent['ref'] = pid_match.group(1)
                patent['country'] = pid_match.group(1)[:2]

        if not patent.get('docId'):
            continue

        # Title from <span id="htmlContent"> inside h3
        title_match = re.search(r'<h3[^>]*>.*?<span id="htmlContent"[^>]*>(.*?)</span>', item, re.DOTALL)
        if title_match:
            patent['title'] = re.sub(r'<[^>]+>', '', title_match.group(1)).strip()
        else:
            patent['title'] = f"Patent {patent.get('ref', '')}"

        # Inventor name (after the patent number span)
        inv_match = re.search(r'<raw-html[^>]*>.*?<span id="htmlContent"[^>]*>(.*?)</span>.*?</raw-html>', item, re.DOTALL)
        if inv_match:
            inventor = re.sub(r'<[^>]+>', '', inv_match.group(1)).strip()
            if inventor and len(inventor) > 2:
                patent['inventors'] = [inventor]

        # Assignee/company — appears after inventor, often in same metadata block
        # Look for organization-like text after inventor
        meta_block = re.search(r'class="metadata[^"]*"[^>]*>(.*?)</h4>', item, re.DOTALL)
        if meta_block:
            meta_text = meta_block.group(1)
            # Clean HTML
            meta_clean = re.sub(r'<[^>]+>', ' ', meta_text)
            meta_clean = re.sub(r'\s+', ' ', meta_clean).strip()
            # The company/org is usually the last distinct phrase
            parts = [p.strip() for p in re.split(r'[•·]', meta_clean) if p.strip()]
            # Extract applicants (organizations are usually longer, capitalized)
            applicants = []
            for part in parts:
                words = part.strip()
                if len(words) > 5 and any(c.isupper() for c in words):
                    # Skip if it looks like a date or patent number
                    if not re.match(r'^[A-Z]{2}\d', words) and not re.match(r'^\d{4}-\d', words):
                        applicants.append(words)
            if applicants:
                patent['applicants'] = applicants[:2]

        # Dates — Priority, Filed, Granted, Published
        dates_match = re.search(r'class="dates[^"]*"[^>]*>(.*?)</div>', item, re.DOTALL)
        if dates_match:
            dates_text = re.sub(r'<[^>]+>', '', dates_match.group(1)).strip()
            # Extract published date
            pub_match = re.search(r'Published\s+(\d{4}-\d{2}-\d{2})', dates_text)
            if pub_match:
                patent['datePub'] = pub_match.group(1)
            elif not patent.get('datePub'):
                # Use granted date as fallback
                grant_match = re.search(r'Granted\s+(\d{4}-\d{2}-\d{2})', dates_text)
                if grant_match:
                    patent['datePub'] = grant_match.group(1)

        # Abstract — text after the dates block
        # The abstract appears after metadata, often as a plain text paragraph
        abs_match = re.search(r'(?:dates|Granted|Published).*?</div>\s*(.*?)\s*(?:</div>|<search-result-item)', item, re.DOTALL)
        if abs_match:
            abstract = re.sub(r'<[^>]+>', ' ', abs_match.group(1)).strip()
            abstract = re.sub(r'\s+', ' ', abstract)
            if len(abstract) > 20:
                patent['abstract'] = abstract[:500]

        # If no abstract found via dates, try broader match
        if not patent.get('abstract'):
            # Look for longer text blocks that aren't metadata
            all_text = re.sub(r'<[^>]+>', ' ', item)
            all_text = re.sub(r'\s+', ' ', all_text).strip()
            # Find text after the metadata section
            meta_end = re.search(r'(?:Filed|Priority)\s+\d{4}', all_text)
            if meta_end:
                remaining = all_text[meta_end.end():]
                # Clean up and take as abstract
                remaining = re.sub(r'^[^a-zA-Z]*', '', remaining)
                if len(remaining) > 30:
                    patent['abstract'] = remaining[:500]

        # Score
        patent['innovation_score'] = max(40, min(95, 85 - i * 5))
        patent['action'] = 'Schedule Deep Dive' if i > 2 else ('Monitor M&A Potential' if i > 0 else 'Initiate BD Call')
        patent['ai_insight'] = f"Google Patents result #{i+1}. {(patent.get('abstract', '')[:100])}..." if patent.get('abstract') else f"Google Patents scan result for {patent.get('ref', '')}."

        patents.append(patent)

    return patents


def scrape_google_patents(query, max_results=10):
    """Main scraping function."""
    url = f"https://patents.google.com/?q={quote_plus(query)}&oq={quote_plus(query)}"
    print(f"[GooglePatents] Scraping: {url}", file=sys.stderr)

    try:
        fetcher = StealthyFetcher()
        result = fetcher.fetch(url, headless=True, network_idle=True)

        if not result or result.status != 200:
            status = result.status if result else 'no response'
            return {
                'error': f'Google Patents returned status {status}',
                'totalResults': 0,
                'patents': [],
                'query': query,
                'source': 'google_patents',
            }

        body = result.body if hasattr(result, 'body') else str(result)
        patents = parse_search_results(body, max_results)

        # Count total results from page
        total_match = re.search(r'About\s+([\d,]+)\s+results', body)
        if not total_match:
            total_match = re.search(r'([\d,]+)\s+results', body)
        total = int(total_match.group(1).replace(',', '')) if total_match else len(patents) * 50

        print(f"[GooglePatents] Got {len(patents)} patents (total ~{total})", file=sys.stderr)

        return {
            'totalResults': total,
            'patents': patents,
            'query': query,
            'source': 'google_patents',
            'fetchedAt': datetime.utcnow().isoformat() + 'Z',
        }

    except Exception as e:
        print(f"[GooglePatents Error] {e}", file=sys.stderr)
        return {
            'error': str(e),
            'totalResults': 0,
            'patents': [],
            'query': query,
            'source': 'google_patents',
        }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: google_patents_scraper.py <query> [max_results]'}))
        sys.exit(1)

    query = sys.argv[1]
    max_results = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    result = scrape_google_patents(query, max_results)
    print(json.dumps(result))
