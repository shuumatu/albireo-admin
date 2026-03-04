import { computed, type Ref } from 'vue'
import lensfunData from '../db/lensfun.json'

interface Camera {
  maker: string
  model: string
  mount: string
  cropfactor: number
}

interface Lens {
  maker: string
  model: string
  mount: string
  cropfactor: number
}

interface Mount {
  name: string
  compat: string[]
}

const cameras: Camera[] = lensfunData.cameras
const lenses: Lens[] = lensfunData.lenses
const mounts: Mount[] = lensfunData.mounts

const cameraMakers = [...new Set(cameras.map(c => c.maker))].sort()

const mountCompatMap = new Map<string, Set<string>>()
for (const m of mounts) {
  const allCompat = new Set([m.name, ...m.compat])
  mountCompatMap.set(m.name, allCompat)
}

function getCompatibleMounts(mountName: string): Set<string> {
  const result = new Set<string>([mountName])
  const entry = mountCompatMap.get(mountName)
  if (entry) {
    for (const m of entry) result.add(m)
  }
  for (const [name, compatSet] of mountCompatMap) {
    if (compatSet.has(mountName)) {
      result.add(name)
    }
  }
  return result
}

export function useLensfun(
  cameraMake: Ref<string | undefined>,
  cameraModel: Ref<string | undefined>,
) {
  const cameraMakeOptions = computed(() =>
    cameraMakers.map(m => ({ label: m, value: m }))
  )

  const cameraModelOptions = computed(() => {
    const maker = cameraMake.value?.trim()
    const list = maker
      ? cameras.filter(c => c.maker === maker)
      : cameras
    return list.map(c => ({ label: c.model, value: c.model }))
  })

  const selectedCameraMount = computed(() => {
    const maker = cameraMake.value?.trim()
    const model = cameraModel.value?.trim()
    if (!maker || !model) return null
    return cameras.find(c => c.maker === maker && c.model === model)?.mount ?? null
  })

  const lensOptions = computed(() => {
    const mount = selectedCameraMount.value
    if (!mount) {
      return lenses.map(l => ({ label: `${l.maker} ${l.model}`, value: `${l.maker} ${l.model}` }))
    }
    const compatMounts = getCompatibleMounts(mount)
    const filtered = lenses.filter(l => compatMounts.has(l.mount))
    if (filtered.length === 0) {
      return lenses.map(l => ({ label: `${l.maker} ${l.model}`, value: `${l.maker} ${l.model}` }))
    }
    return filtered.map(l => ({ label: `${l.maker} ${l.model}`, value: `${l.maker} ${l.model}` }))
  })

  return {
    cameraMakeOptions,
    cameraModelOptions,
    lensOptions,
  }
}
