<template>
  <div>
    <h3 class="mb-4">予約チケット一覧</h3>
    <b-alert class="bg-nplus mb-4" show v-if="loading">
      <b-icon animation="spin" class="mr-1" font-scale="1.5" icon="arrow-clockwise"></b-icon>
      データ取得中
    </b-alert>
    <b-table class="mb-4" :empty-text="emptyText" :fields="fields" :items="reservations" show-empty striped>
      <template v-slot:cell(event_name)="data">
        <router-link :to="{ name: 'event', params: { event_id: data.item.event_id } }">{{ data.value }}</router-link>
      </template>
      <template v-slot:cell(event_price)="data">{{ data.value.toLocaleString() }} 円</template>
      <template v-slot:cell(num_of_resv)="data">{{ data.value }} 枚</template>
    </b-table>
    <div class="text-center">
      <b-button-group>
        <b-button :disabled="page == 0" v-on:click="move(page - 1)">
          <b-icon font-scale="1.5" icon="chevron-left"></b-icon>
        </b-button>
        <b-button class="bg-nplus text-white">
          {{ this.page + 1 }}
        </b-button>
        <b-button :disabled="reservations.length < limit" v-on:click="move(page + 1)">
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
  name: "Reservations",
  data() {
    return {
      fields: [
        { key: "event_name", label: "イベント名" },
        { key: "event_date", label: "日程" },
        { key: "venue_name", label: "会場名" },
        { key: "event_price", label: "金額" },
        { key: "num_of_resv", label: "予約チケット枚数" }
      ],
      reservations: [],
      role: "",
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

      axios.get(`${this.$apiUrl}/users/${localStorage.userId}/reservations?limit=${this.limit}&offset=${this.limit * this.page}`
      ).then((response) => {
        this.reservations = response.data.map((reservation) => {
          const startAt = Moment.utc(reservation.event_start_at);
          const endAt = Moment.utc(reservation.event_end_at);

          if (startAt.format("YYYY/MM/DD") == endAt.format("YYYY/MM/DD")) {
            reservation.event_date = `${startAt.format("YYYY/MM/DD HH:mm")} 〜 ${endAt.format("HH:mm")}`;
          } else {
            reservation.event_date = `${startAt.format("YYYY/MM/DD HH:mm")} 〜 ${endAt.format("YYYY/MM/DD HH:mm")}`;
          }

          return reservation;
        });
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
    move(page) {
      this.reservations = [];
      this.page = page < 0 ? 0 : page;

      this.fetch();
    }
  },
  created() {
    this.role = localStorage.role;

    if (this.role != "audience") {
      this.$router.push("/403");
    }

    this.fetch();
  }
};
</script>
