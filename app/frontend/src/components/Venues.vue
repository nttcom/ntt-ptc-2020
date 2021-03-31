<template>
  <div>
    <b-alert class="bg-nplus mb-4" show v-if="loading">
      <b-icon animation="spin" class="mr-1" font-scale="1.5" icon="arrow-clockwise"></b-icon>
      データ取得中
    </b-alert>
    <b-table class="mb-4" :empty-text="emptyText" :fields="fields" :items="venues" show-empty striped>
      <template v-slot:cell(name)="data">
        <b-link v-on:click="select(data.item)">{{ data.value }}</b-link>
      </template>
      <template v-slot:cell(capacity)="data">{{ data.value }} 席</template>
    </b-table>
    <div class="text-center">
      <b-button-group>
        <b-button :disabled="page == 0" v-on:click="move(page - 1)">
          <b-icon font-scale="1.5" icon="chevron-left"></b-icon>
        </b-button>
        <b-button class="bg-nplus text-white">
          {{ this.page + 1 }}
        </b-button>
        <b-button :disabled="venues.length < limit" v-on:click="move(page + 1)">
          <b-icon font-scale="1.5" icon="chevron-right"></b-icon>
        </b-button>
      </b-button-group>
    </div>
  </div>
</template>

<script>
import axios from "axios";

export default {
  name: "Venues",
  data() {
    return {
      fields: [
        { key: "name", label: "会場名" },
        { key: "capacity", label: "収容人数" }
      ],
      venues: [],
      emptyText: "",
      page: 0,
      limit: 15,
      loading: false
    };
  },
  methods: {
    fetch() {
      this.emptyText = "データ取得中";
      this.loading = true;
      axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

      axios.get(`${this.$apiUrl}/venues?limit=${this.limit}&offset=${this.limit * this.page}`
      ).then((response) => {
        this.venues = response.data;
      }).catch((error) => {
        console.error(error);

        if (error.response.status == 404) {
          this.$router.push("/404");
          return;
        }
      }).finally(() => {
        this.emptyText = "なし";
        this.loading = false;
      });
    },
    select(venue) {
      this.$emit("select-venue", venue);
    },
    move(page) {
      this.venues = [];
      this.page = page < 0 ? 0 : page;

      this.fetch();
    }
  },
  created() {
    this.fetch();
  }
};
</script>
