import os
import wget

if( not os.path.exists("model.py") ):
	wget.download("https://raw.githubusercontent.com/autosoft-dev/ml-on-code/main/assets/model.py")

if( not os.path.exists("utils.py")):
	wget.download("https://raw.githubusercontent.com/autosoft-dev/ml-on-code/main/assets/utils.py")
