<template>
  <div>
    <h3 class="mb-4">ログイン</h3>
    <b-jumbotron class="p-5">
      <p class="mb-4 text-danger" v-if="succeeded == false">ユーザー名またはパスワードが間違っています</p>
      <b-form v-on:submit.prevent="login">
        <b-input-group class="mb-4">
          <b-input-group-prepend>
            <b-input-group-text>
              <b-icon font-scale="1.5" icon="person-fill"></b-icon>
            </b-input-group-text>
          </b-input-group-prepend>
          <b-input placeholder="ユーザー名を入力してください" required :state="succeeded" type="text" v-model="formData.username"></b-input>
        </b-input-group>
        <b-input-group class="mb-4">
          <b-input-group-prepend>
            <b-input-group-text>
              <b-icon font-scale="1.5" icon="key-fill"></b-icon>
            </b-input-group-text>
          </b-input-group-prepend>
          <b-input placeholder="パスワードを入力してください" required :state="succeeded" type="password" v-model="formData.password"></b-input>
        </b-input-group>
        <b-button type="submit">
          <b-icon animation="spin" class="mr-1" font-scale="1.5" icon="arrow-clockwise" v-if="submitting"></b-icon>
          ログイン
        </b-button>
      </b-form>
    </b-jumbotron>
  </div>
</template>

<script>
import axios from "axios";

export default {
  name: "Login",
  data() {
    return {
      formData: {
        username: "",
        password: ""
      },
      submitting: false,
      succeeded: null
    };
  },
  methods: {
    login() {
      this.submitting = true;

      axios.post(`${this.$apiUrl}/login`, this.formData
      ).then((response) => {
        this.succeeded = true;
        localStorage.loggedIn = true;
        localStorage.userId = response.data.user_id;
        localStorage.accessToken = response.data.access_token;
        this.$router.push("/");
      }).catch((error) => {
        this.succeeded = false;
        this.formData.username = "";
        this.formData.password = "";
        console.error(error);
      }).finally(() => {
        this.submitting = false;
      });
    }
  }
};
</script>
