<template>
  <div id="app">
    <b-navbar class="bg-nplus mb-5">
      <b-container>
        <b-navbar-brand class="nplus-logo" href="/">
          <span class="nplus-logo-n">N</span>
          <span class="nplus-logo-plus">+</span>
          <br />
          <span class="nplus-logo-caption">エヌプラス</span>
        </b-navbar-brand>
        <b-navbar-nav>
        </b-navbar-nav>
        <b-navbar-nav>
          <router-link to="/login" v-if="!loggedIn">
            <b-button>
              <b-icon class="mr-1" font-scale="1.5" icon="box-arrow-in-right"></b-icon>
              ログイン
            </b-button>
          </router-link>
          <router-link to="/signup" v-if="!loggedIn">
            <b-button class="ml-3" variant="success">
              <b-icon class="mr-1" font-scale="1.5" icon="pencil-square"></b-icon>
              新規ユーザー登録
            </b-button>
          </router-link>
          <router-link to="/mypage" v-if="loggedIn">
            <b-button>
              <b-icon class="mr-1" font-scale="1.5" icon="person-fill"></b-icon>
              {{ userName }}
            </b-button>
          </router-link>
          <router-link to="/" v-if="loggedIn" v-on:click.native="logout">
            <b-button class="ml-3" variant="danger">
              <b-icon  class="mr-1" font-scale="1.5" icon="box-arrow-right"></b-icon>
              ログアウト
            </b-button>
          </router-link>
        </b-navbar-nav>
      </b-container>
    </b-navbar>
    <b-container>
      <b-alert class="mb-4" show variant="danger" v-if="submitting">
        <b-icon animation="spin" class="mr-1" font-scale="1.5" icon="arrow-clockwise"></b-icon>
        ログアウト中
      </b-alert>
      <b-alert class="mb-4" dismissible show variant="danger" v-if="loggedOut">
        <b-icon class="mr-1" font-scale="1.5" icon="box-arrow-right"></b-icon>
        ログアウトしました
      </b-alert>
      <router-view v-if="!submitting"></router-view>
      <div class="my-5 text-muted">
        © 2020 NTT Performance Tuning Challenge
      </div>
    </b-container>
  </div>
</template>

<script>
import axios from "axios";

export default {
  name: "App",
  data() {
    return {
      loggedIn: false,
      loggedOut: false,
      userName: "マイページ",
      role: "",
      submitting: false
    };
  },
  methods: {
    loginStatus() {
      if (localStorage.loggedIn) {
        const claim = JSON.parse(atob(localStorage.accessToken.split(".")[1]));

        if (claim.exp > Date.now() / 1000) {
          this.loggedIn = true;
          this.loggedOut = false;
          this.role = claim.role;
          localStorage.role = claim.role;

          axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

          axios.get(`${this.$apiUrl}/users/${localStorage.userId}`
          ).then((response) => {
            this.userName = response.data.username;
          }).catch((error) => {
            console.error(error);

            if (error.response.status == 404) {
              this.$router.push("/404");
              return;
            }
          });
        } else {
          this.logout();
        }
      } else {
        this.loggedIn = false;
      }
    },
    logout() {
      this.submitting = true;
      axios.defaults.headers.Authorization = `Bearer ${localStorage.accessToken}`;

      axios.post(`${this.$apiUrl}/logout`
      ).catch((error) => {
        console.error(error);
      }).finally(() => {
        this.loggedIn = false;
        this.loggedOut = true;
        this.userName = "マイページ";
        this.role = "";
        this.submitting = false;

        localStorage.removeItem("loggedIn");
        localStorage.removeItem("userId");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("role");

        if (this.$route.path != "/") {
          this.$router.push("/");
        }
      });
    }
  },
  created() {
    this.loginStatus();
  },
  watch: {
    $route() {
      this.loginStatus();
    }
  }
};
</script>
