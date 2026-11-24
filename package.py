from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile, ZIP_DEFLATED
import argparse, json, sys

parser=argparse.ArgumentParser(description="Package the Firefox extension.")
parser.add_argument("origin",help="Deployed HTTPS service origin")
parser.add_argument("--notes",type=Path,help="Optional private notes-data.js generated from your course files")
parser.add_argument("--output",type=Path,default=Path("cncaS2.zip"))
args=parser.parse_args()
url=urlsplit(args.origin)
if url.scheme!="https" or not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in ("","/"):
    sys.exit("Enter the deployed HTTPS service origin.")
origin="https://"+url.netloc
if args.notes and (not args.notes.is_file() or args.notes.suffix!=".js"):
    sys.exit("--notes must point to the private notes-data.js file.")
scripts=["origin.js","references.js","notes-lookup.js"]
if args.notes:scripts.append("notes-data.js")
scripts.append("background.js")
manifest={"manifest_version":2,"name":"cncaS2","version":"0.9.10","description":"Request answers to supported Moodle text questions.","permissions":["activeTab","storage","https://www.google.com/*",origin+"/*"],"browser_action":{"default_popup":"panel.html","default_title":"\u200b","default_icon":{"16":"icon.svg","32":"icon.svg"}},"background":{"scripts":scripts},"browser_specific_settings":{"gecko":{"id":"quizpilot-college@quizpilot.invalid","data_collection_permissions":{"required":["websiteContent"]}}}}
manifest["commands"]={"ask-question":{"suggested_key":{"default":"Alt+Z"},"description":"Ask about the hovered or focused Moodle question"}}
with ZipFile(args.output,"w",ZIP_DEFLATED) as z:
    z.writestr("manifest.json",json.dumps(manifest))
    z.writestr("origin.js","const QUIZPILOT_ORIGIN="+json.dumps(origin)+";")
    for p in Path(__file__).with_name("extension").iterdir():z.write(p,p.name)
    if args.notes:z.write(args.notes,"notes-data.js")
