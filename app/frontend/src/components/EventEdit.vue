<template>
  <div>
    <h3 class="mb-4">イベント予約変更</h3>
    <b-alert class="bg-nplus mb-4" show v-if="loading">
      <b-icon animation="spin" class="mr-1" font-scale="1.5" icon="arrow-clockwise"></b-icon>
      データ取得中
    </b-alert>
    <p class="mb-4 text-danger" v-if="succeeded == false">イベント予約の変更に失敗しました</p>
    <EventForm action="イベント予約変更" :submitting="submitting" variant="secondary" v-bind:event="event" v-on:submit="update"></EventForm>
  </div>
</template>

<script>
import axios from "axios";
import Moment from "moment-timezone";
import EventForm from "@/components/EventForm";

export default {
  name: "EventEdit",
  components: {
    EventForm
  },
  data() {
    return {
      event: {},
      role: "",
      loading: false,
      submitting: false,
      succeeded: null
    };
  },
  methods: {
    fetch() {
      this.loading = true;
      axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

      axios.get(`${this.$apiUrl}/events/${this.$route.params.event_id}`
      ).then((response) => {
        this.event = response.data;

        if (this.role == "artist" && this.event.artist_id != localStorage.userId) {
          this.$router.push("/403");
          return;
        }

        this.event.timeSlotOptions = this.timeSlotOptions(response.data);
      }).catch((error) => {
        console.error(error);

        if (error.response.status == 404) {
          this.$router.push("/404");
          return;
        }
      }).finally(() => {
        this.loading = false;
      });
    },
    update(formData) {
      this.submitting = true;
      axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

      axios.put(`${this.$apiUrl}/events/${this.event.id}`, formData
      ).then((response) => {
        if (formData.image) {
          this.put(formData.image);
        }

        this.$router.push(`/events/${response.data.id}/reservations`);
      }).catch((error) => {
        this.succeeded = false;
        console.error(error);
      }).finally(() => {
        this.submitting = false;
      });
    },
    put(image) {
      let formData = new FormData();
      let config = { headers: { "Content-Type": "multipart/form-data" } };

      axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

      formData.append("image", image);

      axios.put(`${this.$apiUrl}/events/${this.event.id}/image`, formData, config
      ).catch((error) => {
        this.succeeded = false;
        console.error(error);
      });
    },
    timeSlotOptions(data) {
      let am = { text: "AM", value: [null], disabled: true};
      let pm = { text: "PM", value: [null], disabled: true};
      let all = { text: "全日", value: [null, null], disabled: true};

      if (data.timeslot_ids.length == 2) {
        all.value = data.timeslot_ids;
      } else if (Moment.utc(data.end_at).hour() < 12) {
        am.value = data.timeslot_ids;
      } else {
        pm.value = data.timeslot_ids;
      }

      return [am, pm, all];
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
