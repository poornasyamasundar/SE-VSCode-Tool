from urllib.request import pathname2url
from pygls.server import LanguageServer
from sqlalchemy import desc
from whoosh.fields import Schema, TEXT
from whoosh import index
import os
import os.path
from whoosh import qparser, query, highlight
from whoosh.analysis import StemmingAnalyzer
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


def preprocess(s):
    return [i.lower() for i in s.split()]

class PythonLanguageServer(LanguageServer):
    GET_SEARCH_RESULTS = 'ACS-python.getSearchResults'
    FETCH_SUMMARY = 'ACS-python.fetchSummary'

    def __init__(self):
        super().__init__()


server = PythonLanguageServer()


@server.command(PythonLanguageServer.GET_SEARCH_RESULTS)
def getSearchResults(ls: PythonLanguageServer, *args):
    definitions = args[0][1]
    results = getResults(definitions, args[0][2])
    return results


@server.command(PythonLanguageServer.FETCH_SUMMARY)
def computeSummary(ls: PythonLanguageServer, *args):
    URL = "http://ec2-35-154-160-245.ap-south-1.compute.amazonaws.com:3000/summary"
    PARAMS = {'code' : args[0][0]}
    response = requests.post(url=URL, json=PARAMS)

    j = json.loads(response.text)
    summary = j["summary"]
    return summary

def get_vector(model, s):
    return np.sum(np.array([model[i] for i in preprocess(s)]), axis=0)

def getResults(definitions, searchQuery):
    URL = "http://ec2-35-154-160-245.ap-south-1.compute.amazonaws.com:3000/search"
    #model = api.load("glove-wiki-gigaword-300")
    print("definitions = ", definitions)
    results = []
    for i in range(0, len(definitions), 2):
        functionDescription = definitions[i+1]

        PARAMS = {'query': searchQuery, 'document': functionDescription}
        try:
            print("before sending response")
            response = requests.post(url=URL, json=PARAMS)
            descriptionScore = json.loads(response.text)
            print("description = ", descriptionScore)
            descriptionScore = float(descriptionScore["score"])
            print("after making it float", descriptionScore)
            print("in try", descriptionScore)
        except:
            descriptionScore = 0
        
        finalScore = descriptionScore
        results.append([finalScore, i])
    
    results.sort(key=lambda x: -x[0])
    print("results = ", results)

    sortedDefinitions = []
    count = 0
    for i in results:
        print(i)
        if( count == 4 ):
            break
        if( i[0] > 0.4 ):
            sortedDefinitions.append(definitions[i[1]])
            sortedDefinitions.append(definitions[i[1]+1])
            count += 1
    
    print(sortedDefinitions)
    return sortedDefinitions
