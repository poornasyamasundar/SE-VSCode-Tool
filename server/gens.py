# reference for the gensim text similarity model usage.

from scipy import spatial
import gensim.downloader as api
import numpy as np

# choose from multiple models https://github.com/RaRe-Technologies/gensim-data
model = api.load("glove-wiki-gigaword-300")


def preprocess(s):
    return [i.lower() for i in s.split()]

# returns the vector reprensentation of a word
def get_vector(s):
    return np.sum(np.array([model[i] for i in preprocess(s)]), axis=0)

# sorts the descriptions according to the percentage match with query, uses cosine similarity between vectors
# first generates vectors from words, and then calculates the cosine similarity between vectors for the result
def get_similarity(query, descriptions):
    results = []
    print(descriptions, query)
    for i in range(len(descriptions)):
        d = descriptions[i]
        results.append(
            [1 - spatial.distance.cosine(get_vector(query), get_vector(d)), i])
    results.sort(key=lambda x: -x[0])
    print(results)
