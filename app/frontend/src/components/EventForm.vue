<template>
  <div>
    <div v-if="state == 'selectVenue'">
      <p class="mb-4">会場を選択してください</p>
      <Venues v-on:select-venue="selectVenue"></Venues>
    </div>
    <div v-if="state == 'selectTimeSlots'">
      <p class="mb-4">{{ venue.name }}</p>
      <TimeSlots :venueId="venue.id" v-on:select-timeslots="selectTimeSlots"></TimeSlots>
    </div>
    <div v-if="state == 'inputForm'">
      <b-form enctype="multipart/form-data" v-on:submit.prevent="submit">
        <b-form-group class="mb-4" label="イベント名" label-cols="2" label-for="event-name">
          <b-form-input id="event-name" placeholder="イベント名を入力してください" required type="text" v-model="formData.eventName"></b-form-input>
        </b-form-group>
        <b-form-group class="mb-4" label="ジャンル" label-cols="2" label-for="event-genre">
          <b-form-select :disabled="loading" id="event-genre" :options="genres" required v-model="formData.eventGenreId"></b-form-select>
        </b-form-group>
        <b-row class="mb-4">
          <b-col cols="2">会場名</b-col>
          <b-col cols="10">{{ venue.name }}</b-col>
        </b-row>
        <b-row class="mb-4">
          <b-col cols="2">日程</b-col>
          <b-col cols="10">{{ date }}</b-col>
        </b-row>
        <b-form-group class="mb-4" label="利用枠" label-cols="2" label-for="timeslots">
          <b-form-radio-group id="timeslots" :options="timeSlotOptions" required v-model="formData.timeSlotIds"></b-form-radio-group>
        </b-form-group>
        <b-form-group class="mb-4" label="開始時間" label-cols="2" label-for="start-at">
          <b-form-input id="start-at" required type="time" v-model="formData.startAt"></b-form-input>
        </b-form-group>
        <b-form-group class="mb-4" label="終了時間" label-cols="2" label-for="end-at">
          <b-form-input id="end-at" required type="time" v-model="formData.endAt"></b-form-input>
        </b-form-group>
        <b-form-group class="mb-4" label="料金" label-cols="2" label-for="price">
          <b-input-group>
            <b-form-input id="price" min="1" required type="number" v-model="formData.price"></b-form-input>
            <b-input-group-append>
              <b-input-group-text>円</b-input-group-text>
            </b-input-group-append>
          </b-input-group>
        </b-form-group>
        <b-form-group class="mb-4" label="画像" label-cols="2" label-for="image">
          <b-form-file accept="image/png" browse-text="PNG" drop-placeholder="画像をここにドロップしてください" id="image" placeholder="画像を選択またはドロップしてください" v-model="formData.image"></b-form-file>
        </b-form-group>
        <b-button type="submit" :variant="variant">
          <b-icon animation="spin" class="mr-1" font-scale="1.5" icon="arrow-clockwise" v-if="submitting"></b-icon>
          {{ action }}
        </b-button>
      </b-form>
    </div>
  </div>
</template>

<script>
import axios from "axios";
import Moment from "moment-timezone";
import Venues from "@/components/Venues";
import TimeSlots from "@/components/TimeSlots";

export default {
  name: "EventForm",
  components: {
    Venues,
    TimeSlots
  },
  props: {
    event: Object,
    action: String,
    variant: String,
    submitting: Boolean
  },
  data() {
    return {
      venue: {},
      timeSlots: {},
      timeSlotOptions: [],
      genres: [],
      formData: {
        eventName: "",
        eventGenreId: null,
        timeSlotIds: [],
        price: 1,
        startAt: "",
        endAt: "",
        image: null
      },
      state: "selectVenue",
      loading: false
    };
  },
  computed: {
    date() {
      if (this.timeSlots.am) {
        return Moment.utc(this.timeSlots.am.start_at).format("YYYY/MM/DD");
      } else if (this.timeSlots.pm) {
        return Moment.utc(this.timeSlots.pm.start_at).format("YYYY/MM/DD");
      } else if (this.event.start_at) {
        return Moment.utc(this.event.start_at).format("YYYY/MM/DD");
      } else {
        return "未定";
      }
    }
  },
  methods: {
    init() {
      if (Object.keys(this.event).length != 0) {
        this.venue = {
          id: this.event.venue_id,
          name: this.event.venue_name,
          capacity: this.event.capacity
        };
        this.timeSlotOptions = this.event.timeSlotOptions;
        this.formData.eventName = this.event.event_name,
        this.formData.eventGenreId = this.event.event_genre_id,
        this.formData.timeSlotIds = this.event.timeslot_ids,
        this.formData.price = this.event.price,
        this.formData.startAt = Moment.utc(this.event.start_at).format("HH:mm"),
        this.formData.endAt = Moment.utc(this.event.end_at).format("HH:mm"),
        this.state = "inputForm";
      }
    },
    fetch() {
      this.loading = true;
      axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

      axios.get(`${this.$apiUrl}/genres`
      ).then((response) => {
        this.genres = response.data.map((genre) => {
          return {
            text: genre.name,
            value: genre.id
          };
        });

        this.genres.unshift(
          {
            text: "ジャンルを選択してください",
            value: null
          }
        );
      }).catch((error) => {
        console.error(error);
      }).finally(() => {
        this.loading = false;
      });
    },
    submit() {
      let date = "";

      if (this.timeSlots.am) {
        date = Moment.utc(this.timeSlots.am.start_at).format("YYYY-MM-DD");
      } else if (this.timeSlots.pm) {
        date = Moment.utc(this.timeSlots.pm.start_at).format("YYYY-MM-DD");
      } else if (this.event.start_at) {
        date = Moment.utc(this.event.start_at).format("YYYY-MM-DD");
      }

      this.$emit("submit", {
        event_name: this.formData.eventName,
        event_genre_id: Number(this.formData.eventGenreId),
        timeslot_ids: this.formData.timeSlotIds,
        price: Number(this.formData.price),
        start_at: Moment.utc(`${date} ${this.formData.startAt}`).format(),
        end_at: Moment.utc(`${date} ${this.formData.endAt}`).format(),
        image: this.formData.image
      });
    },
    selectVenue(venue) {
      this.venue = venue;
      this.state = "selectTimeSlots";
    },
    selectTimeSlots(timeSlots) {
      let am = { text: "AM", value: [timeSlots.am?.id]};
      let pm = { text: "PM", value: [timeSlots.pm?.id]};
      let all = { text: "全日", value: [timeSlots.am?.id, timeSlots.pm?.id]};

      if (!timeSlots.am) {
        am.disabled = true;
        all.disabled = true;
      } else if (!timeSlots.pm) {
        pm.disabled = true;
        all.disabled = true;
      }

      this.timeSlots = timeSlots;
      this.timeSlotOptions = [am, pm, all];
      this.state = "inputForm";
    }
  },
  created() {
    this.fetch();
  },
  watch: {
    event() {
      this.init();
    }
  }
};
</script>
