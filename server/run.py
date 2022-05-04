import os
import json
import torch
import torch.nn as nn
from model import Seq2Seq
from utils import Example, convert_examples_to_features
from transformers import RobertaConfig, RobertaModel, RobertaTokenizer
from torch.utils.data import TensorDataset, DataLoader, SequentialSampler
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn

from scipy import spatial
import gensim.downloader as api
import numpy as np

## We are defining all the needed functions here.
def inference(data, model, tokenizer):
    # Calculate bleu
    eval_sampler = SequentialSampler(data)
    eval_dataloader = DataLoader(data, sampler=eval_sampler, batch_size=len(data))

    model.eval()
    p = []
    for batch in eval_dataloader:
        batch = tuple(t.to('cpu') for t in batch)
        source_ids, source_mask = batch
        with torch.no_grad():
            preds = model(source_ids=source_ids, source_mask=source_mask)
            for pred in preds:
                t = pred[0].cpu().numpy()
                t = list(t)
                if 0 in t:
                    t = t[: t.index(0)]
                text = tokenizer.decode(t, clean_up_tokenization_spaces=False)
                p.append(text)
    return (p, source_ids.shape[-1])


def get_features(examples, tokenizer):
    features = convert_examples_to_features(
        examples, tokenizer, stage="test"
    )
    all_source_ids = torch.tensor(
        [f.source_ids[: 256] for f in features], dtype=torch.long
    )
    all_source_mask = torch.tensor(
        [f.source_mask[: 256] for f in features], dtype=torch.long
    )
    return TensorDataset(all_source_ids, all_source_mask)


def build_model(model_class, config, tokenizer):
    encoder = model_class(config=config)
    decoder_layer = nn.TransformerDecoderLayer(
        d_model=config.hidden_size, nhead=config.num_attention_heads
    )
    decoder = nn.TransformerDecoder(decoder_layer, num_layers=6)
    model = Seq2Seq(
        encoder=encoder,
        decoder=decoder,
        config=config,
        beam_size=10,
        max_length=128,
        sos_id=tokenizer.cls_token_id,
        eos_id=tokenizer.sep_token_id,
    )

    model.load_state_dict(
        torch.load(
            "pytorch_model.bin",
            map_location=torch.device("cpu"),
        ),
        strict=False,
    )
    return model

config = RobertaConfig.from_pretrained("microsoft/codebert-base")
tokenizer = RobertaTokenizer.from_pretrained( "microsoft/codebert-base", do_lower_case=False)

model = build_model( model_class = RobertaModel, config = config, tokenizer = tokenizer).to('cpu')

querymodel = api.load("glove-wiki-gigaword-300")
"""
code = ''
with open("model.py") as f:
	lines = f.readlines()
	for line in lines:
		code += line

print(code)
example = [Example(source=code, target=None)]
message, length = inference(get_features(example, tokenizer), model, tokenizer)
print(message)
"""

def preprocess(s):
    return [i.lower() for i in s.split()]

def get_vector(s):
    try:
        result = np.sum(np.array([querymodel[i] for i in preprocess(s)]), axis=0)
    except:
        result = np.sum(np.array([querymodel[i] for i in preprocess("not valid")]), axis=0)

    return result

class Body(BaseModel):
    code: str

class SearchBody(BaseModel):
    query: str
    document: str

print("Hello")
score = 1 - spatial.distance.cosine(get_vector("s"), get_vector("addNum"))
print("score = ", score)

app = FastAPI()

@app.get('/')
def main():
	return {"message": "success"}

@app.post('/summary')
async def summary( request:Body ):
    print(request.code)
    example = [Example(source=request.code, target=None)] 
    message, length = inference(get_features(example, tokenizer), model, tokenizer)
    print(message[0])
    return {"summary": message[0]}

@app.post('/search')
async def search( request:SearchBody ):
    print("request = ", request)
    print("request.query = ", request.query)
    print("request.document = ", request.document)

    query = str(request.query)
    d = str(request.document)
    print("query = ", query)
    print("d = " , d)
    score = 1 - spatial.distance.cosine(get_vector(query), get_vector(d))
    print("score = ", score)

    return {"score": str(score) }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3000)
