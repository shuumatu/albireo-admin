import request from "../utils/request";
const UPLOAD_API_BASE = import.meta.env.VITE_UPLOAD_API_BASE as string;

interface InitiateParams {
  fileName: string;
  fileType: string;
  fileSize: number;
  fileHash: string;
}

interface InitiateResponse{
  key:string;
  uploadId:string;
  partSize:number;
  alreadyExists:boolean;
  url:string;//去重命中时为访问url DirectUpload时为上传url
  directUpload:boolean;

}

export function initiateUpload(params: InitiateParams):Promise<InitiateResponse>{
  return request.post(`${UPLOAD_API_BASE}/multipart/initiate`,params)
}


interface PartsParams {
  key: string;
  uploadId: string;
}

interface PartETagDTO{
  partNumber:number;
  eTag:string;
}

interface ListUploadedPartsResponse{
  key:string;
  uploadId:string;
  parts:PartETagDTO[];
}

export function getParts(params:PartsParams):Promise<ListUploadedPartsResponse>{
  return request.get(`${UPLOAD_API_BASE}/multipart/list-parts`,{params})
}

interface UrlRequestParams{
  key:string;
  uploadId:string;
  partNumber:number;
}

interface PartUrlResponse{
  url:string;
  partNumber:number;
}


export function getUploadUrl(params:UrlRequestParams):Promise<PartUrlResponse>{
  return request.post(`${UPLOAD_API_BASE}/multipart/part-url`,params);
}

interface CompleteUploadParams{
  hash:string;
  key:string;
  uploadId:string;
  fileType:string;
  parts:PartETagDTO[];
}

export function completeUpload(params:CompleteUploadParams):Promise<void>{
  return request.post(`${UPLOAD_API_BASE}/multipart/complete`,params)
}


export interface CompleteDirectUploadParams{
  fileHash:string;
  objectKey:string;
  fileType:string;
}
export function completeDirectUpload(params:CompleteDirectUploadParams):Promise<void>{
  return request.post(`${UPLOAD_API_BASE}/complete-direct-upload`,params)
}