import requests

url = "https://api.watttime.org/v3/signal-index"


# To login and obtain an access token, use this code:

import requests
from requests.auth import HTTPBasicAuth
login_url = 'https://api.watttime.org/login'
rsp = requests.get(login_url, auth=HTTPBasicAuth('freddo', 'the_frog'))
TOKEN = rsp.json()['token']
print(rsp.json())


# Provide your TOKEN here, see https://docs.watttime.org/#tag/Authentication/operation/get_token_login_get for more information
# TOKEN = ""
headers = {"Authorization": f"Bearer {TOKEN}"}
params = {
    "region": "CAISO_NORTH",
    "signal_type": "co2_moer",
}
response = requests.get(url, headers=headers, params=params)
response.raise_for_status()
print(response.json())