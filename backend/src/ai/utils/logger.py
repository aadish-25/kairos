import os
import json
import traceback
from datetime import datetime

# Resolve logs directory to d:\my-projects\kairos\backend\logs
LOG_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../logs"))

if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR, exist_ok=True)

SEPARATOR = "\n------------------------------------------------------------\n"

def write_log(category: str, content):
    try:
        timestamp = datetime.now().isoformat()
        log_file_path = os.path.join(LOG_DIR, f"{category}.log")
        
        log_string = f"[{timestamp}]\n"
        if isinstance(content, (dict, list)):
            log_string += json.dumps(content, indent=2, default=str)
        elif isinstance(content, BaseException):
            log_string += "".join(traceback.format_exception(None, content, content.__traceback__))
        else:
            log_string += str(content)
            
        log_string += SEPARATOR
        
        with open(log_file_path, "a", encoding="utf-8") as f:
            f.write(log_string)
    except Exception as e:
        print(f"Failed to write to log {category}: {e}")
