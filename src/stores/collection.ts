import { defineStore } from 'pinia'
export const useCollectionStore = defineStore('collection', {
  state: () => ({
    activeCollectionId: null as number | null
  }),
  actions: {
    setCollection(id: number | null) {
      this.activeCollectionId = id
    }
  }
})

export const useCollectionDetailStore = defineStore('collectionDetail', {
  state: () => ({
    img: null as boolean | null
  }),
  actions: {
    setImg(img: boolean){
      this.img = img
    }
  },
  persist: true  // 开启持久化

})