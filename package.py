from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile, ZIP_DEFLATED
import json, sys
url=urlsplit(sys.argv[1])
if url.scheme!="https" or not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in ("","/"):
    sys.exit("Enter the deployed HTTPS service origin.")
origin="https://"+url.netloc
manifest={"manifest_version":2,"name":"cncaS2","version":"0.9.4","description":"Request answers to supported Moodle text questions.","permissions":["activeTab","https://www.google.com/*",origin+"/*"],"browser_action":{"default_popup":"panel.html"},"background":{"scripts":["origin.js","references.js","background.js"]},"browser_specific_settings":{"gecko":{"id":"quizpilot-college@quizpilot.invalid","data_collection_permissions":{"required":["websiteContent"]}}}}
manifest["commands"]={"ask-question":{"suggested_key":{"default":"Alt+Z"},"description":"Ask about the hovered or focused Moodle question"}}
with ZipFile("cncaS2.zip","w",ZIP_DEFLATED) as z:
    z.writestr("manifest.json",json.dumps(manifest))
    z.writestr("origin.js","const QUIZPILOT_ORIGIN="+json.dumps(origin)+";")
    for p in Path(__file__).with_name("extension").iterdir():z.write(p,p.name)
