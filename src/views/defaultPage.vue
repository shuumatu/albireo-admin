<template>
    <div class="background-container">

    </div>
</template>

<style scoped>
.background-container {
  height: 100%;
  width: 100%;
  background-image: url('../assets/AlbireoBig.jpg'); 
  background-size: cover;        /* 让图片填满容器 */
  background-position: center;   /* 居中对齐 */
  background-repeat: no-repeat;  /* 不重复 */
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 0;
  left: 0;
}

.content {
  z-index: 1;
  text-align: center;
}
</style>