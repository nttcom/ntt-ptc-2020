<template>
  <div>
    <b-alert class="bg-nplus mb-4" show v-if="loading">
      <b-icon animation="spin" class="mr-1" font-scale="1.5" icon="arrow-clockwise"></b-icon>
      データ取得中
    </b-alert>
    <p class="mb-3 text-center">
      <b-link class="mr-4" v-on:click="move(date.subtract(1, 'months'))">
        <b-icon font-scale="1.5" icon="chevron-left"></b-icon>
      </b-link>
      {{ date.format("YYYY年MM月") }}
      <b-link class="ml-4" v-on:click="move(date.add(1, 'months'))">
        <b-icon font-scale="1.5" icon="chevron-right"></b-icon>
      </b-link>
    </p>
    <b-table :empty-text="emptyText" :fields="fields" :items="timeSlots" show-empty small striped>
      <template v-slot:cell(status)="data">
        <b-link v-if="data.value.am || data.value.pm" v-on:click="select(data.value)">
          AM
          <b-icon icon="circle" v-if="data.value.am"></b-icon>
          <b-icon icon="x" v-if="!data.value.am"></b-icon>
          PM
          <b-icon icon="circle" v-if="data.value.pm"></b-icon>
          <b-icon icon="x" v-if="!data.value.pm"></b-icon>
        </b-link>
        <span v-if="!data.value.am && !data.value.pm">
          AM
          <b-icon icon="x"></b-icon>
          PM
          <b-icon icon="x"></b-icon>
        </span>
      </template>
    </b-table>
  </div>
</template>

<script>
import axios from "axios";
import Moment from "moment-timezone";

export default {
  name: "TimeSlots",
  props: {
    venueId: Number
  },
  data() {
    return {
      fields: [
        { key: "date", label: "日付" },
        { key: "status", label: "予約状況" }
      ],
      timeSlots: [],
      date: Moment.utc(),
      emptyText: "",
      loading: false
    };
  },
  methods: {
    fetch() {
      const from = this.date.startOf("month").format();
      const to = this.date.endOf("month").format();

      this.emptyText = "データ取得中";
      this.loading = true;
      axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

      axios.get(`${this.$apiUrl}/venues/${this.venueId}/timeslots?from=${from}&to=${to}`
      ).then((response) => {
        this.format(response.data);
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
    format(data) {
      const daysInMonth = this.date.endOf("month").date();
      const now = Moment.utc();

      let timeSlots = new Array(daysInMonth).fill(null).map((value, index) => {
        return {
          date: index + 1,
          status: { am: null, pm: null }
        };
      });

      data.forEach((timeSlot) => {
        const startAt = Moment.utc(timeSlot.start_at);

        if (startAt < now) { return; }

        switch(startAt.format("HH:mm")) {
          case "00:00":
            timeSlots[startAt.date() - 1].status.am = timeSlot;
            break;
          case "12:00":
            timeSlots[startAt.date() - 1].status.pm = timeSlot;
            break;
        }
      });

      this.timeSlots = timeSlots;
    },
    select(timeSlots) {
      this.$emit("select-timeslots", timeSlots);
    },
    move(date) {
      this.timeSlots = [];
      this.date = date;

      this.fetch();
    }
  },
  created() {
    this.fetch();
  }
};
</script>
