<template>
  <div>
    <b-card :img-src="image" img-top>
      <b-card-title>{{ event.event_name }}</b-card-title>
      <b-card-text>
        <b-list-group flush>
          <b-list-group-item>
            <b-icon class="mr-1" font-scale="1.5" icon="mic-fill"></b-icon>
            {{ event.artist_name }}
          </b-list-group-item>
          <b-list-group-item>
            <b-icon class="mr-1" font-scale="1.5" icon="calendar-date"></b-icon>
            {{ date }}
          </b-list-group-item>
          <b-list-group-item>
            <b-icon class="mr-1" font-scale="1.5" icon="building"></b-icon>
            {{ event.venue_name }}
          </b-list-group-item>
          <b-list-group-item>
            <b-icon class="mr-1" font-scale="1.5" icon="cash"></b-icon>
            {{ price }}
          </b-list-group-item>
          <b-list-group-item>
            <b-icon class="mr-1" font-scale="1.5" icon="people-fill"></b-icon>
            {{ event.capacity }} 人
          </b-list-group-item>
          <b-list-group-item>
            <b-icon class="mr-1" font-scale="1.5" icon="card-heading"></b-icon>
            {{ reservationStatus }}
          </b-list-group-item>
        </b-list-group>
      </b-card-text>
      <div v-if="(role == 'artist' && event.artist_id == userId ) || role == 'owner'">
        <router-link :to="{ name: 'event_edit', params: { event_id: event.id} }">
          <b-button>イベント予約変更</b-button>
        </router-link>
        <router-link class="ml-3" :to="{ name: 'event_reservations', params: { event_id: event.id} }" v-if="this.$route.name != 'event_reservations'">
          <b-button>イベント予約状況</b-button>
        </router-link>
      </div>
    </b-card>
  </div>
</template>

<script>
import Moment from "moment-timezone";

export default {
  name: "Event",
  data() {
    return {
      userId: "",
      role: ""
    };
  },
  props: {
    event: Object
  },
  computed: {
    image() {
      if (this.event.id) {
        return `${this.$apiUrl}/events/${this.event.id}/image`;
      } else {
        return null;
      }
    },
    date() {
      if (this.event.start_at) {
        const startAt = Moment.utc(this.event.start_at);
        const endAt = Moment.utc(this.event.end_at);

        if (startAt.format("YYYY/MM/DD") == endAt.format("YYYY/MM/DD")) {
          return `${startAt.format("YYYY/MM/DD HH:mm")} 〜 ${endAt.format("HH:mm")}`;
        } else {
          return `${startAt.format("YYYY/MM/DD HH:mm")} 〜 ${endAt.format("YYYY/MM/DD HH:mm")}`;
        }
      } else {
        return "未定";
      }
    },
    price() {
      if (this.event.price) {
        return `${this.event.price.toLocaleString()} 円`;
      } else {
        return "未定";
      }
    },
    reservationStatus() {
      if (this.role == "artist" || this.role == "owner") {
        return `${this.event.current_resv} / ${this.event.capacity} 席`;
      } else {
        if (this.event.current_resv / this.event.capacity < 0.8) {
          return "空席あり";
        } else if (this.event.current_resv / this.event.capacity < 1.0) {
          return "残席わずか";
        } else {
          return "満席";
        }
      }
    }
  },
  created() {
    this.userId = localStorage.userId;
    this.role = localStorage.role;
  }
};
</script>
