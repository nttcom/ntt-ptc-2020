<template>
  <div>
    <h3 class="mb-4">マイページ</h3>
    <b-list-group>
      <router-link class="list-group-item list-group-item-action" to="/reservations" v-if="role == 'audience'">
        <b-icon class="mr-1" font-scale="1.5" icon="card-heading"></b-icon>
        予約チケット一覧
      </router-link>
      <router-link class="list-group-item list-group-item-action" to="/events/new" v-if="role == 'artist'">
        <b-icon class="mr-1" font-scale="1.5" icon="pencil-square"></b-icon>
        新規イベント予約
      </router-link>
      <router-link class="list-group-item list-group-item-action" to="/events" v-if="role == 'artist' || role == 'owner'">
        <b-icon class="mr-1" font-scale="1.5" icon="card-list"></b-icon>
        予約イベント一覧
      </router-link>
    </b-list-group>
  </div>
</template>

<script>
export default {
  name: "MyPage",
  data() {
    return {
      role: ""
    };
  },
  created() {
    this.role = localStorage.role;
  }
};
</script>
