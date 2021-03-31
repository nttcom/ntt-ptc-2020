<template>
  <div>
    <h3 class="mb-4">予約イベント一覧</h3>
    <b-alert class="bg-nplus mb-4" show v-if="loading">
      <b-icon animation="spin" class="mr-1" font-scale="1.5" icon="arrow-clockwise"></b-icon>
      データ取得中
    </b-alert>
    <b-table class="mb-4" :empty-text="emptyText" :fields="fields" :items="events" show-empty striped>
      <template v-slot:cell(event_name)="data">
        <router-link :to="{ name: 'event_reservations', params: { event_id: data.item.id } }">{{ data.value }}</router-link>
      </template>
      <template v-slot:cell(price)="data">{{ data.value.toLocaleString() }} 円</template>
    </b-table>
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
import Moment from "moment-timezone";

export default {
  name: "Events",
  data() {
    return {
      fields: [
        { key: "event_name", label: "イベント名" },
        { key: "event_date", label: "日程" },
        { key: "venue_name", label: "会場名" },
        { key: "price", label: "金額" },
        { key: "reservation_status", label: "予約状況" }
      ],
      events: [],
      role: "",
      emptyText: "",
      page: 0,
      limit: 15,
      loading: false
    };
  },
  methods: {
    fetch() {
      let requestUrl = "";

      this.emptyText = "データ取得中";
      this.loading = true;
      axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

      if (this.role == "artist") {
        requestUrl = `${this.$apiUrl}/events?user_id=${localStorage.userId}&limit=${this.limit}&offset=${this.limit * this.page}`;
      } else if (this.role == "owner") {
        requestUrl = `${this.$apiUrl}/events?limit=${this.limit}&offset=${this.limit * this.page}`;
      }

      axios.get(requestUrl
      ).then((response) => {
        this.events = response.data.map((event) => {
          const startAt = Moment.utc(event.start_at);
          const endAt = Moment.utc(event.end_at);

          if (startAt.format("YYYY/MM/DD") == endAt.format("YYYY/MM/DD")) {
            event.event_date = `${startAt.format("YYYY/MM/DD HH:mm")} 〜 ${endAt.format("HH:mm")}`;
          } else {
            event.event_date = `${startAt.format("YYYY/MM/DD HH:mm")} 〜 ${endAt.format("YYYY/MM/DD HH:mm")}`;
          }

          event.reservation_status = `${event.current_resv} / ${event.capacity} 席`;

          return event;
        });
      }).catch((error) => {
        console.error(error);
      }).finally(() => {
        this.emptyText = "なし";
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
    this.role = localStorage.role;

    if (this.role != "artist" && this.role != "owner") {
      this.$router.push("/403");
    }

    this.fetch();
  }
};
</script>
