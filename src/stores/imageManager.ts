import { defineStore } from 'pinia'
export const useImageManagerStore = defineStore('imageManager', {
  state: () => ({

    collectionId: null as number | null
  }),
  actions: {

    setCollection(id: number | null) {
      this.collectionId = id
    }
  }
})
