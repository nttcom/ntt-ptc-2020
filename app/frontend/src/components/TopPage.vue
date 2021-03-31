<template>
  <div>
    <b-alert class="bg-nplus mb-4" show v-if="loading">
      <b-icon animation="spin" class="mr-1" font-scale="1.5" icon="arrow-clockwise"></b-icon>
      データ取得中
    </b-alert>
    <b-row>
      <b-col class="mb-4" cols="4" v-for="(event, index) in events" v-bind:key="index">
        <b-card :img-src="event.image" overlay text-variant="white" :title="event.event_name">
          <b-card-text>
            {{ event.artist_name }}
            <router-link :to="{ name: 'event', params: { event_id: event.id } }">
              <b-button style="bottom: 1rem; position: absolute; right: 1rem;">
                <b-icon class="mr-1" font-scale="1.5" icon="card-heading"></b-icon>
                詳細・予約
              </b-button>
            </router-link>
          </b-card-text>
        </b-card>
      </b-col>
    </b-row>
    <div class="text-center">
      <b-button-group>
        <b-button :disabled="page == 0" v-on:click="move(page - 1)">
          <b-icon font-scale="1.5" icon="chevron-left"></b-icon>
        </b-button>
        <b-button class="bg-nplus text-white">
          {{ this.page + 1 }}
        </b-button>
        <b-button :disabled="events.length < limit" v-on:click="move(page + 1)">
          <b-icon font-scale="1.5" icon="chevron-right"></b-icon>
        </b-button>
      </b-button-group>
    </div>
  </div>
</template>

<script>
import axios from "axios";

export default {
  name: "TopPage",
  data() {
    return {
      events: [],
      page: 0,
      limit: 9,
      loading: false
    };
  },
  methods: {
    fetch() {
      this.loading = true;

      axios.get(`${this.$apiUrl}/events?limit=${this.limit}&offset=${this.limit * this.page}`
      ).then((response) => {
        this.events = response.data.map((event) => {
          event.image = `${this.$apiUrl}/events/${event.id}/image`;
          return event;
        });
      }).catch((error) => {
        console.error(error);
      }).finally(() => {
        this.loading = false;
      });
    },
    move(page) {
      this.events = [];
      this.page = page < 0 ? 0 : page;

      this.fetch();
    }
  },
  created() {
    this.fetch();
  }
};
</script>
