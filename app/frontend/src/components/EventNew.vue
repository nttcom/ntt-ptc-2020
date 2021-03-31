<template>
  <div>
    <h3 class="mb-4">新規イベント予約</h3>
    <p class="mb-4 text-danger" v-if="succeeded == false">新規イベントの予約に失敗しました</p>
    <EventForm action="新規イベント予約" :submitting="submitting" variant="success" v-on:submit="create"></EventForm>
  </div>
</template>

<script>
import axios from "axios";
import EventForm from "@/components/EventForm";

export default {
  name: "EventNew",
  components: {
    EventForm
  },
  data() {
    return {
      role: "",
      submitting: false,
      succeeded: null
    };
  },
  methods: {
    create(formData) {
      this.submitting = true;
      axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

      axios.post(`${this.$apiUrl}/events`, formData
      ).then((response) => {
        if (formData.image) {
          this.put(response.data.id, formData.image);
        }

        this.$router.push(`/events/${response.data.id}/reservations`);
      }).catch((error) => {
        this.succeeded = false;
        console.error(error);
      }).finally(() => {
        this.submitting = false;
      });
    },
    put(id, image) {
      let formData = new FormData();
      let config = { headers: { "Content-Type": "multipart/form-data" } };

      axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

      formData.append("image", image);

      axios.put(`${this.$apiUrl}/events/${id}/image`, formData, config
      ).catch((error) => {
        this.succeeded = false;
        console.error(error);
      });
    }
  },
  created() {
    this.role = localStorage.role;

    if (this.role != "artist") {
      this.$router.push("/403");
    }
  }
};
</script>
