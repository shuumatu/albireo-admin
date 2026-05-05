import { ref } from 'vue'
import { getConfig } from '../../../api/systemConfig'

/**
 * R2 CDN 自定义域名的全局缓存。
 *
 * 设计要点：
 *  - 模块级 singleton：所有视频组件共用一份，整页只会发起一次系统配置请求；
 *  - 响应式 ref：拉到配置后所有 computed 会自动重算，第一次渲染先用兜底值；
 *  - 兜底值与公共站保持一致（{@link albireo/src/views/VideoDetail.vue}），
 *    避免后端配置缺失时整个预览功能挂掉。
 *
 * 与 `VITE_PUBLIC_SITE_URL` 的区别：
 *  - `VITE_PUBLIC_SITE_URL` 指公共站前端地址（用户点"在新窗口播放"会跳到那），
 *    用于拼 `/video/{uuid}` 详情页 URL；
 *  - `cdnDomain` 是 R2 CDN 域名，承载实际 mp4 / jpg 文件，用于拼 `/{objectKey}/480p/480p.mp4` 这种流地址。
 *  - 二者不能混用：之前误把公共站 URL 当 CDN 用，导致 hover 预览 / 封面帧选择器都拉的是一个 404。
 */
const cdnDomain = ref<string>('albireo.shuumatu.com')
let initialized = false

export function useCdnDomain() {
  if (!initialized) {
    initialized = true
    getConfig('storage', 'custom_domain')
      .then((cfg) => {
        if (cfg?.value) cdnDomain.value = cfg.value
      })
      .catch(() => { /* 系统配置读不到就保持兜底值 */ })
  }
  return cdnDomain
}

/**
 * 把 cdn 域名规整成 https:// 开头的完整 origin，去掉尾部斜杠。
 * 给到的可能形态：
 *  - `albireo.shuumatu.com`
 *  - `https://albireo.shuumatu.com`
 *  - `https://albireo.shuumatu.com/`
 */
export function normalizeCdnOrigin(domain: string): string {
  const d = (domain || '').trim()
  const withProto = d.startsWith('http://') || d.startsWith('https://') ? d : `https://${d}`
  return withProto.replace(/\/+$/, '')
}
