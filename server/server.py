from urllib.request import pathname2url
from pygls.server import LanguageServer
import os
import os.path
import requests

import os
import json
from transformers import RobertaConfig, RobertaModel, RobertaTokenizer
from torch.utils.data import TensorDataset, DataLoader, SequentialSampler

import torch
import torch.nn as nn

from scipy import spatial
import gensim.downloader as api
import numpy as np


# Python Lanuage Server Initialization
class PythonLanguageServer(LanguageServer):
    GET_SEARCH_RESULTS = 'ACS-python.getSearchResults'
    FETCH_SUMMARY = 'ACS-python.fetchSummary'

    def __init__(self):
        super().__init__()


# Start the server
server = PythonLanguageServer()


@server.command(PythonLanguageServer.GET_SEARCH_RESULTS)
def getSearchResults(ls: PythonLanguageServer, *args):
    definitions = args[0][1]
    results = getResults(definitions, args[0][2])
    return results


@server.command(PythonLanguageServer.FETCH_SUMMARY)
def computeSummary(ls: PythonLanguageServer, *args):
    # The URL for the hosted endpoint
    URL = "http://ec2-35-154-160-245.ap-south-1.compute.amazonaws.com:3000/summary"
    PARAMS = {'code': args[0][0]}
    # post a request to the url, with params,
    try:
        print("before requesting")
        response = requests.post(url=URL, json=PARAMS)
        print("response = ", response)
        # reponse contains the summary
        j = json.loads(response.text)
        summary = j["summary"]
        return summary
    except:
        print("Exception occured")


# returns vectors for a word using the gensim model
def get_vector(model, s):
    return np.sum(np.array([model[i] for i in preprocess(s)]), axis=0)

# convert the words into lower case


def preprocess(s):
    return [i.lower() for i in s.split()]


def getResults(definitions, searchQuery):
    # The URL for the hosted endpoint
    URL = "http://ec2-35-154-160-245.ap-south-1.compute.amazonaws.com:3000/search"
    results = []
    for i in range(0, len(definitions), 2):
        functionDescription = definitions[i+1]
        PARAMS = {'query': searchQuery, 'document': functionDescription}
        try:
            response = requests.post(url=URL, json=PARAMS)
            # match score between query string and the description
            descriptionScore = json.loads(response.text)
            descriptionScore = float(descriptionScore["score"])
        except:
            descriptionScore = 0

        finalScore = descriptionScore
        # store the description and the corresponding score
        results.append([finalScore, i])

    # sort the results based on the score
    results.sort(key=lambda x: -x[0])

    sortedDefinitions = []
    count = 0

    # sort the list of descriptions based on their scores
    for i in results:
        if(count == 4):
            break
        if(i[0] > 0.4):
            sortedDefinitions.append(definitions[i[1]])
            sortedDefinitions.append(definitions[i[1]+1])
            count += 1

    return sortedDefinitions
