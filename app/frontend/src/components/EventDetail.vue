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
      <b-col cols="6" v-if="role == 'audience'">
        <b-jumbotron class="p-5" style="height: 100%">
          <h3 class="mb-4">チケット</h3>
          <p class="mb-4" v-if="reserved">{{ reservedAt }} にチケットを予約しています</p>
          <p class="mb-4" v-if="full && !reserved && !loading">このイベントは満席です</p>
          <p class="mb-4 text-success" v-if="succeeded && action == 'reserve'">新規チケットの予約に成功しました</p>
          <p class="mb-4 text-danger" v-if="succeeded == false && action == 'reserve'">新規チケットの予約に失敗しました</p>
          <p class="mb-4 text-success" v-if="succeeded && action == 'cancel'">チケット予約の取消に成功しました</p>
          <p class="mb-4 text-danger" v-if="succeeded == false && action == 'cancel'">チケット予約の取消に失敗しました</p>
          <b-form v-on:submit.prevent="reserve" v-if="!reserved && !loading">
            <b-input-group class="mb-4">
              <b-input-group-prepend>
                <b-input-group-text>
                  <b-icon font-scale="1.5" icon="card-heading"></b-icon>
                </b-input-group-text>
              </b-input-group-prepend>
              <b-input :disabled="full" min="1" placeholder="枚数を入力してください" required :state="succeeded" type="number" v-model="formData.numOfResv"></b-input>
              <b-input-group-append>
                <b-input-group-text>枚</b-input-group-text>
              </b-input-group-append>
            </b-input-group>
            <b-button :disabled="full" type="submit" variant="success">
              <b-icon animation="spin" class="mr-1" font-scale="1.5" icon="arrow-clockwise" v-if="submitting"></b-icon>
              新規チケット予約
            </b-button>
          </b-form>
          <b-form v-on:submit.prevent="cancel" v-if="reserved && !loading">
            <b-input-group class="mb-4">
              <b-input-group-prepend>
                <b-input-group-text>
                  <b-icon font-scale="1.5" icon="card-heading"></b-icon>
                </b-input-group-text>
              </b-input-group-prepend>
              <b-input disabled :state="succeeded" type="number" :value="reservation.num_of_resv"></b-input>
              <b-input-group-append>
                <b-input-group-text>枚</b-input-group-text>
              </b-input-group-append>
            </b-input-group>
            <b-button type="submit" variant="danger">
              <b-icon animation="spin" class="mr-1" font-scale="1.5" icon="arrow-clockwise" v-if="submitting"></b-icon>
              チケット予約取消
            </b-button>
          </b-form>
        </b-jumbotron>
      </b-col>
    </b-row>
  </div>
</template>

<script>
import axios from "axios";
import Moment from "moment-timezone";
import Event from "@/components/Event";

export default {
  name: "EventDetail",
  components: {
    Event
  },
  data() {
    return {
      event: {},
      reservation: {},
      formData: {
        numOfResv: 1
      },
      role: "",
      loading: false,
      submitting: false,
      action: null,
      succeeded: null
    };
  },
  computed: {
    reserved() {
      return Object.keys(this.reservation).length != 0;
    },
    reservedAt() {
      if (this.reservation.created_at) {
        return Moment.utc(this.reservation.created_at).format("YYYY/MM/DD HH:mm");
      } else {
        return "不明";
      }
    },
    full() {
      return this.event.current_resv == this.event.capacity;
    }
  },
  methods: {
    fetch() {
      this.loading = true;
      axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

      axios.get(`${this.$apiUrl}/events/${this.$route.params.event_id}`
      ).then((response) => {
        this.event = response.data;

        if (this.role == "audience") {
          axios.get(`${this.$apiUrl}/users/${localStorage.userId}/reservations?limit=1000`
          ).then((response) => {
            this.reservation = response.data.find((reservation) => (reservation.event_id == this.event.id)) || {};
          }).catch((error) => {
            console.error(error);

            if (error.response.status == 404) {
              this.$router.push("/404");
              return;
            }
          }).finally(() => {
            this.loading = false;
          });
        }
      }).catch((error) => {
        console.error(error);

        if (error.response.status == 404) {
          this.$router.push("/404");
          return;
        }
      }).finally(() => {
        if (this.role != "audience") {
          this.loading = false;
        }
      });
    },
    reserve() {
      this.submitting = true;
      this.action = "reserve";
      axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

      axios.post(`${this.$apiUrl}/events/${this.event.id}/reservations`, {
        num_of_resv: Number(this.formData.numOfResv)
      }).then(() => {
        this.succeeded = true;
        this.fetch();
      }).catch((error) => {
        this.succeeded = false;
        console.error(error);
      }).finally(() => {
        this.submitting = false;
      });
    },
    cancel() {
      this.submitting = true;
      this.action = "cancel";
      axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

      axios.delete(`${this.$apiUrl}/reservations/${this.reservation.id}`
      ).then(() => {
        this.succeeded = true;
        this.reservation = {};
        this.fetch();
      }).catch((error) => {
        this.succeeded = false;
        console.error(error);
      }).finally(() => {
        this.submitting = false;
      });
    }
  },
  created() {
    this.role = localStorage.role;
    this.fetch();
  }
};
</script>
