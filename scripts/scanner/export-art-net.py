"""
Exports the scanner's art network (scanner-data/art-net.bin, read by src/scanner/artnet.ts):
Keras MobileNetV3-Small with ImageNet weights (Apache 2.0), no top, average-pooled, at 160x128,
with batch norm folded into the convolutions and weights stored as float16.

    python -m venv venv && venv/bin/pip install tensorflow-cpu
    venv/bin/python scripts/scanner/export-art-net.py scanner-data/art-net.bin

Keras downloads the weights from storage.googleapis.com. A new network means a new picture index
(npm run scan:index), since the index records which network made it.
"""
import os,sys,json,struct,numpy as np
os.environ['TF_CPP_MIN_LOG_LEVEL']='3'
import tensorflow as tf
OUT=sys.argv[1]; H,W=128,160
m=tf.keras.applications.MobileNetV3Small(input_shape=(H,W,3),include_top=False,pooling='avg',weights='imagenet')
L={l.name:l for l in m.layers}
tensors=[]; blob=bytearray()
def add(name, arr):
    a=np.asarray(arr,dtype=np.float16); off=len(blob); blob.extend(a.tobytes()); tensors.append({'name':name,'shape':list(a.shape),'offset':off})
def fold(conv, bn):
    w=L[conv].get_weights()[0]  # (kh,kw,cin,cout) or depthwise (kh,kw,c,1)
    b=np.zeros(w.shape[2] if 'depthwise' in conv else w.shape[3])
    g,beta,mean,var=L[bn].get_weights(); eps=L[bn].epsilon
    s=g/np.sqrt(var+eps)
    if 'depthwise' in conv: w=w[:,:,:,0]*s  # (kh,kw,c)
    else: w=w*s
    return w, beta-mean*s
def conv1x1(name, w, b):  # store as (cout, cin)
    add(name+'.w', w.reshape(w.shape[2],w.shape[3]).T); add(name+'.b', b)
blocks=[]
w,b=fold('conv','conv_bn'); add('stem.w', w.transpose(3,0,1,2)); add('stem.b', b)  # (cout,kh,kw,cin)
for i in range(11):
    p='expanded_conv' + (f'_{i}' if i else '')
    blk={}
    if p+'_expand' in L:
        w,b=fold(p+'_expand',p+'_expand_bn'); conv1x1(f'b{i}.expand',w,b); blk['expand']=True
    dw=L[p+'_depthwise']; w,b=fold(p+'_depthwise',p+'_depthwise_bn'); add(f'b{i}.dw.w', w); add(f'b{i}.dw.b', b)
    blk['k']=dw.kernel_size[0]; blk['stride']=dw.strides[0]; blk['exp']=w.shape[2]
    if p+'_squeeze_excite_conv' in L:
        w1,b1=L[p+'_squeeze_excite_conv'].get_weights(); w2,b2=L[p+'_squeeze_excite_conv_1'].get_weights()
        conv1x1(f'b{i}.se1',w1,b1); conv1x1(f'b{i}.se2',w2,b2); blk['se']=True
    w,b=fold(p+'_project',p+'_project_bn'); conv1x1(f'b{i}.project',w,b); blk['out']=w.shape[3]
    blk['act']='hswish' if i>=3 else 'relu'
    blocks.append(blk)
w,b=fold('conv_1','conv_1_bn'); conv1x1('head',w,b)
header=json.dumps({'arch':'mobilenetv3-small','input':[H,W],'scale':1/127.5,'offset':-1,'blocks':blocks,'tensors':tensors}).encode()
with open(OUT,'wb') as f:
    f.write(b'MTGN'); f.write(struct.pack('<I',len(header))); f.write(header)
    pad=(-(8+len(header)))%2; f.write(b'\0'*pad); f.write(bytes(blob))
print(f"wrote {OUT}: {len(blob)} bytes of weights, {len(blocks)} blocks")
