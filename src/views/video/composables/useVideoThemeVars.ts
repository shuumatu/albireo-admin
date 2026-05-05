import { computed, type CSSProperties } from 'vue'
import { useThemeVars } from 'naive-ui'

/**
 * 把 naive-ui 公共主题 token 转成一份 CSS 变量 style。
 *
 * 为什么需要它：
 *  - n-layout-content 默认只暴露 --n-color / --n-text-color，
 *    其它如 --n-card-color / --n-divider-color / --n-text-color-1/2/3
 *    没有全局注入；
 *  - VideoListPage 顶层把这套 var 注入到 .video-list-page 上，子组件 CSS
 *    可直接 var(--n-text-color-3)；
 *  - 但 VideoEditDrawer 走 n-drawer 的 Teleport，VideoHoverPreview 也走自己的
 *    Teleport，这些子树离开了 .video-list-page，无法继承；
 *  - 这两处再各自调用一次本 composable 把 var 注回各自的根元素，
 *    样式表才会读到正确的颜色。
 *
 * 命名遵循 naive-ui 内部约定：组件内部计算的私有 var 不会被这里覆盖
 * （它们会写在自己的 inline style 上、优先级更高），所以不会污染 n-button / n-tag 等。
 */
export function useVideoThemeVars() {
  const t = useThemeVars()
  const themeCssVars = computed<CSSProperties>(() => ({
    '--n-text-color': t.value.textColor2,
    '--n-text-color-1': t.value.textColor1,
    '--n-text-color-2': t.value.textColor2,
    '--n-text-color-3': t.value.textColor3,
    '--n-card-color': t.value.cardColor,
    '--n-popover-color': t.value.popoverColor,
    '--n-action-color': t.value.actionColor,
    '--n-hover-color': t.value.hoverColor,
    '--n-pressed-color': t.value.pressedColor,
    '--n-divider-color': t.value.dividerColor,
    '--n-border-color': t.value.borderColor,
    '--n-primary-color': t.value.primaryColor,
    '--n-primary-color-hover': t.value.primaryColorHover,
    '--n-error-color': t.value.errorColor,
    '--n-warning-color': t.value.warningColor,
    '--n-info-color': t.value.infoColor,
    '--n-success-color': t.value.successColor,
    '--n-code-color': t.value.codeColor,
    '--n-box-shadow-1': t.value.boxShadow1,
    '--n-box-shadow-2': t.value.boxShadow2,
  }))
  return themeCssVars
}
