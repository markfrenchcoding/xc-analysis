# python pull/whoswho_extract.py          # fetch what is missing, then extract
# python pull/whoswho_extract.py --fetch  # re-fetch every PDF first
#
# Who's Who in Oregon High School Track & Field and Cross Country has published
# continuously since 1965 and is the definitive record for these two sports in
# this state. athletic.net starts at 2004. Who's Who has team rankings back to
# 1960 and four-year state qualifiers back to 1963, which is the whole reason
# to go near it: it is forty years the roster database has never seen.
#
# It is 49 static PDFs on a school district's site. This script does the one
# step Node cannot: PDF -> text. Everything downstream - the parsing, the
# joining, the tests - is in pull/whoswho.js, in Node with the rest of the
# tooling, reading the committed .txt files. The split is deliberate. Parsing
# is where the bugs live and where the tests need to aim, so it belongs in the
# language the other suites are written in.
#
# The .txt files are committed. They are small, they are the actual input to
# the parser, and committing them means a re-run of the suite does not depend
# on a school district's web server still being up.
import os
import re
import sys
import subprocess

BASE = 'https://phs.phoenix.k12.or.us/uploaded/faculty/Cornet_curriculum/XC_TF'
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'whoswho', 'raw')
TEXT = os.path.join(HERE, 'whoswho', 'text')

# Only the documents that can say something about one school's athletes or its
# standing. The other 37 are statewide colour - history essays, national
# rankings, back-issue order forms - and parsing them would be collecting
# rather than building.
DOCS = [
    ('WW_XC_4_Year', 'four-year state qualifiers since 1963'),
    ('WW_XC_Boys_Power_Rankings', 'all-time boys team rankings since 1960'),
    ('WW_XC_Girls_Power_Rankings', 'all-time girls team rankings since 1974'),
    ('WW_XC_State_Stats_top_80', 'all-time top 5k performers at State'),
    ('WW_XC_SeasonalTeamRankings', 'top-10 team rankings by season since 2005'),
    ('WW_XC_Miscellaneous', 'miscellaneous cross country statistics since 1949'),
    ('WW_XC_Participation', 'team participation rates'),
    ('WW_TF_Placers', 'State placers and champions by team since 1969'),
    ('WW_TF_Team_Scores', 'best team scores at State by classification'),
    ('6A_Master_List', '6A all-time top-10 with class records'),
]


def fetch(name):
    """curl, for the same reason pull/crawl.js uses it: it is the transport
    that is reliably served, and it reports its own failures honestly."""
    out = os.path.join(RAW, name + '.pdf')
    url = BASE + '/' + name + '.pdf'
    r = subprocess.run(['curl', '-sS', '-f', '-m', '120', '-o', out, url],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError('fetch failed for ' + name + ': ' + r.stderr.strip()[:120])
    return os.path.getsize(out)


def extract(name):
    from pypdf import PdfReader
    src = os.path.join(RAW, name + '.pdf')
    reader = PdfReader(src)
    pages = []
    for i, page in enumerate(reader.pages):
        t = page.extract_text() or ''
        # A page break is meaningful in these documents - several of them put
        # boys on one page and girls on the next - so it is kept rather than
        # flattened away.
        pages.append('<<<PAGE %d>>>\n%s' % (i + 1, t))
    body = '\n'.join(pages)
    # Collapse the runs of spaces the PDF layout leaves behind, but never the
    # newlines: every parser downstream works a line at a time.
    body = '\n'.join(re.sub(r'[ \t]+', ' ', ln).strip() for ln in body.split('\n'))
    dst = os.path.join(TEXT, name + '.txt')
    with open(dst, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(body + '\n')
    return len(reader.pages), len(body)


def main():
    os.makedirs(RAW, exist_ok=True)
    os.makedirs(TEXT, exist_ok=True)
    refetch = '--fetch' in sys.argv
    for name, what in DOCS:
        pdf = os.path.join(RAW, name + '.pdf')
        if refetch or not os.path.exists(pdf):
            size = fetch(name)
            print('  fetched %-30s %8d bytes' % (name, size))
        pages, chars = extract(name)
        print('  %-30s %2d pages -> %6d chars   %s' % (name, pages, chars, what))
    print('\n  text in pull/whoswho/text/, parsed by pull/whoswho.js')


if __name__ == '__main__':
    main()
