import axios from "axios";

const UPLOAD_API_BASE = import.meta.env.VITE_UPLOAD_API_BASE as string;

const uploadRequest = axios.create({
  baseURL: UPLOAD_API_BASE,
  timeout: 30000,
});

uploadRequest.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

uploadRequest.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

interface InitiateParams {
  fileName: string;
  fileType: string;
  fileSize: number;
  fileHash: string;
  dateTime?: string | null;  // ISO 8601 格式的日期时间，如: "2021-04-30T17:07:24"
  gpsData?: GpsData | null;  // 添加这一行
  dateTimeSource?: 'exif' | 'file';
}
export interface GpsData {
  latitude: number;
  longitude: number;
  altitude: number | null;
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
  return uploadRequest.post("/multipart/initiate",params)
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
  return uploadRequest.get("/multipart/list-parts",{params})
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
  return uploadRequest.post("/multipart/part-url",params);
}

interface CompleteUploadParams{
  hash:string;
  key:string;
  uploadId:string;
  fileType:string;
  parts:PartETagDTO[];
}

export function completeUpload(params:CompleteUploadParams):Promise<void>{
  return uploadRequest.post("/multipart/complete",params)
}


export interface CompleteDirectUploadParams{
  fileHash:string;
  objectKey:string;
  fileType:string;
}
export function completeDirectUpload(params:CompleteDirectUploadParams):Promise<void>{
  return uploadRequest.post("/complete-direct-upload",params)
}