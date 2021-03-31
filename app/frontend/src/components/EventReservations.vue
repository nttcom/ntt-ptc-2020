<template>
  <div>
    <b-alert class="bg-nplus mb-4" show v-if="loading">
      <b-icon animation="spin" class="mr-1" font-scale="1.5" icon="arrow-clockwise"></b-icon>
      データ取得中
    </b-alert>
    <b-row>
      <b-col cols="6">
        <Event v-bind:event="event"></Event>
      </b-col>
      <b-col cols="6" v-if="role == 'artist' || role == 'owner'">
        <p class="mb-4 text-danger" v-if="succeeded == false">チケット予約の取消に失敗しました</p>
        <b-table class="mb-4" :empty-text="emptyText" :fields="fields" :items="reservations" show-empty striped>
          <template v-slot:cell(num_of_resv)="data">{{ data.value }} 枚</template>
          <template v-slot:cell(cancel)="data">
            <b-link v-if="data.value != submitting" v-on:click="cancel(data.value)">
              <b-icon font-scale="1.5" icon="x" variant="danger"></b-icon>
            </b-link>
            <b-icon animation="spin" font-scale="1.5" icon="arrow-clockwise" variant="danger" v-if="data.value == submitting"></b-icon>
          </template>
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
      </b-col>
    </b-row>
  </div>
</template>

<script>
import axios from "axios";
import Event from "@/components/Event";

export default {
  name: "EventReservations",
  components: {
    Event
  },
  data() {
    return {
      event: {},
      fields: [
        { key: "username", label: "ユーザ名" },
        { key: "num_of_resv", label: "予約枚数" }
      ],
      reservations: [],
      role: "",
      emptyText: "",
      page: 0,
      limit: 15,
      loading: false,
      submitting: 0,
      succeeded: null
    };
  },
  methods: {
    fetch() {
      this.emptyText = "データ取得中";
      this.loading = true;
      axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

      if (localStorage.role == "owner") {
        this.fields.unshift({ key: "user_id", label: "ユーザID" });
        this.fields.push({ key: "cancel", label: "予約取消" });
      }

      axios.get(`${this.$apiUrl}/events/${this.$route.params.event_id}`
      ).then((response) => {
        this.event = response.data;

        if (this.role == "artist" && this.event.artist_id != localStorage.userId) {
          this.$router.push("/403");
          return;
        }

        axios.get(`${this.$apiUrl}/events/${this.event.id}/reservations?limit=${this.limit}&offset=${this.limit * this.page}`
        ).then((response) => {
          this.reservations = response.data.map((reservation) => {
            reservation.cancel = reservation.id;
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
      }).catch((error) => {
        console.error(error);

        if (error.response.status == 404) {
          this.$router.push("/404");
          return;
        }
      });
    },
    cancel(id) {
      const index = this.reservations.findIndex((reservation) => (reservation.id == id));

      this.submitting = id;
      axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

      axios.delete(`${this.$apiUrl}/reservations/${id}`
      ).then(() => {
        this.succeeded = true;
        this.$delete(this.reservations, index);
        this.fetch();
      }).catch((error) => {
        this.succeeded = false;
        console.error(error);
      }).finally(() => {
        this.submitting = 0;
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

    if (this.role != "artist" && this.role != "owner") {
      this.$router.push("/403");
    }

    this.fetch();
  }
};
</script>
