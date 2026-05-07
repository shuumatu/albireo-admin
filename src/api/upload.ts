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

export interface GpsData {
  latitude: number;
  longitude: number;
  altitude: number | null;
}

interface InitiateParams {
  fileName: string;
  fileType: string;
  fileSize: number;
  fileHash: string;
  dateTime?: string | null;          // ISO 8601 格式的日期时间
  gpsData?: GpsData | null;
  dateTimeSource?: 'exif' | 'file';
}

interface InitiateResponse {
  key: string;
  uploadId: string;
  partSize: number;
  alreadyExists: boolean;
  url: string;          // 去重命中时为访问 url；DirectUpload 时为上传 url
  directUpload: boolean;
}

export function initiateUpload(params: InitiateParams): Promise<InitiateResponse> {
  return uploadRequest.post("/multipart/initiate", params);
}

interface PartsParams {
  key: string;
  uploadId: string;
}

export interface PartETagDTO {
  partNumber: number;
  eTag: string;
}

interface ListUploadedPartsResponse {
  key: string;
  uploadId: string;
  parts: PartETagDTO[];
}

export function getParts(params: PartsParams): Promise<ListUploadedPartsResponse> {
  return uploadRequest.get("/multipart/list-parts", { params });
}

interface UrlRequestParams {
  key: string;
  uploadId: string;
  partNumber: number;
}

interface PartUrlResponse {
  url: string;
  partNumber: number;
}

export function getUploadUrl(params: UrlRequestParams): Promise<PartUrlResponse> {
  return uploadRequest.post("/multipart/part-url", params);
}

interface CompleteUploadParams {
  hash: string;
  key: string;
  uploadId: string;
  fileType: string;
  parts: PartETagDTO[];
}

export function completeUpload(params: CompleteUploadParams): Promise<void> {
  return uploadRequest.post("/multipart/complete", params);
}

export interface CompleteDirectUploadParams {
  fileHash: string;
  objectKey: string;
  fileType: string;
  fileSize?: number; // 可选：服务端用 headObject 校验对象大小
}

export function completeDirectUpload(params: CompleteDirectUploadParams): Promise<void> {
  return uploadRequest.post("/complete-direct-upload", params);
}

export type SessionStatus = 'none' | 'active' | 'completed';

export interface SessionStatusResponse {
  status: SessionStatus;
  key?: string;
  uploadId?: string;
  partSize?: number;
  totalSize?: number;
  uploadedParts?: PartETagDTO[];
}

/** 按 fileHash 查询当前是否存在可恢复的会话 */
export function getSessionByHash(fileHash: string): Promise<SessionStatusResponse> {
  return uploadRequest.get('/multipart/session', { params: { fileHash } });
}

/**
 * 取消上传：兼容分片 / 直传两种路径，幂等。
 * 后端会同步 abort MPU、删除孤儿对象，并清理 metadata 中的 uploading 占位。
 */
export interface CancelUploadParams {
  fileHash?: string;
  objectKey?: string;
  uploadId?: string;
}

export function cancelUpload(params: CancelUploadParams): Promise<void> {
  return uploadRequest.post('/cancel-upload', params);
}
